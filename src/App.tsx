import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import "@fastpix/fp-player";
import {
  SHORTS_FEED,
  type FastPixPlayerElement,
  type FullscreenDocument,
  type FullscreenElement,
  type ShortMeta,
} from "./shorts/types";
import { ShortItem } from "./shorts/ShortItem";
import { perfLog, posterUrl } from "./shorts/utils";
import { prefetchMaster } from "./shorts/startup";
import { endView } from "./shorts/analytics";
import { FeedTabs } from "./shorts/FeedTabs";
import { goBack } from "./explore/routes";
import { takeSoundIntoFeed } from "./shorts/soundPreference";

const APP_START_MS = performance.now();

const WHEEL_IDLE_MS = 160;

// How long to wait for the visible short to start playing before mounting its
// neighbours anyway (e.g. autoplay was blocked or the network is very slow).
const NEIGHBOR_MOUNT_FALLBACK_MS = 4000;

// We restore the visible short ourselves (from the #short/<id> hash) instead of
// letting the browser restore a raw scroll offset that doesn't match activeIndex.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// Last short the viewer was on, so a refresh or return visit reopens it (from
// its start), like Reels/Shorts. Storage can be unavailable (private mode,
// blocked site data), so every access is guarded.
const LAST_SHORT_KEY = "fp-shorts:last-short";

function readLastShortId(): string | null {
  try {
    return localStorage.getItem(LAST_SHORT_KEY);
  } catch {
    return null;
  }
}

// Main feed: remember the short and keep the URL on it, so refresh/back land
// on it too.
function rememberShort(short: ShortMeta) {
  try {
    localStorage.setItem(LAST_SHORT_KEY, short.id);
  } catch {
    // ignore
  }
  history.replaceState(history.state, "", `#short/${encodeURIComponent(short.id)}`);
}

const shortHash = (short: ShortMeta) => `#short/${encodeURIComponent(short.id)}`;

// Resolve the short to show first: a #short/<id> link, else the short the
// viewer was last on, else the top.
function getInitialIndex(): number {
  const match = /^#short\/(.+)$/.exec(globalThis.location.hash);
  const id = match ? decodeURIComponent(match[1]) : readLastShortId();
  if (!id) return 0;
  return Math.max(0, SHORTS_FEED.findIndex((s) => s.id === id));
}
const INITIAL_INDEX = getInitialIndex();
perfLog("App module evaluated", { initialIndex: INITIAL_INDEX, hash: globalThis.location.hash });

// Start the visible short's (and its neighbours') poster and master playlist
// now, in parallel with hls.js loading and React booting. Masters already in
// the build-time snapshot are skipped; the rest are fetched once and handed
// to hls.js by the startup playlist loader (see shorts/startup.ts).
function warmShorts(indices: number[]) {
  for (const i of indices) {
    const short = SHORTS_FEED[i];
    if (!short) continue;
    const priority = i === INITIAL_INDEX ? "high" : "low";
    // The <img> in ShortItem reuses this download.
    const img = new Image();
    img.fetchPriority = priority;
    img.src = posterUrl(short.id);
    prefetchMaster(short.id, priority);
  }
}
warmShorts([INITIAL_INDEX, INITIAL_INDEX + 1, INITIAL_INDEX - 1]);

// Eagerly buffer the active short, prefetch metadata for its neighbours, and
// leave everything else untouched.
function getPreloadFor(
  index: number,
  activeIndex: number,
): "none" | "metadata" | "auto" {
  if (index === activeIndex) return "auto";
  if (Math.abs(index - activeIndex) === 1) return "metadata";
  return "none";
}

// ── ShortsApp ─────────────────────────────────────────────────────────────────
// The vertical player. By default it plays the main For You feed; a playlist
// passes its episodes as `feed`, so scrolling stays within that playlist.
export type ShortsAppProps = {
  feed?: ShortMeta[];
  // Defaults to the #short/<id> link, else the last short watched.
  initialIndex?: number;
  // Called when the visible short changes (persist position / update URL).
  // Must be stable (module-level or memoized).
  onActiveChange?: (short: ShortMeta) => void;
  // URL hash a shared link should open.
  shareHash?: (short: ShortMeta) => string;
  // Playlist mode: back button + title instead of the feed tabs.
  playlist?: { title: string; backHash: string };
};

export default function ShortsApp({
  feed = SHORTS_FEED,
  initialIndex: initialIndexProp,
  onActiveChange = rememberShort,
  shareHash = shortHash,
  playlist,
}: ShortsAppProps) {
  // Resolved per mount: the feed remounts when a short or episode is opened
  // from a grid.
  const [initialIndex] = useState(() => initialIndexProp ?? getInitialIndex());
  const [activeIndex, setActiveIndex]             = useState(initialIndex);
  // Until the visible short is playing, mount only that one player so it gets
  // the full bandwidth — every mounted player starts fetching HLS segments.
  const [neighborsReady, setNeighborsReady]       = useState(false);
  // Starts unmuted when entered from an Explore preview that had sound on (the
  // tap that brought us here is the user gesture that allows it).
  const [startWithSound] = useState(takeSoundIntoFeed);
  const [isMuted, setIsMuted]                     = useState(!startWithSound);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasUserInteractedRef = useRef<boolean>(startWithSound);
  const activeIndexRef = useRef<number>(initialIndex);
  const isMutedRef = useRef<boolean>(!startWithSound);
  const playerRefsByIndex = useRef<Record<number, FastPixPlayerElement | null>>(
    {},
  );

  // Wheel
  const cancelAnimation = useRef<(() => void) | null>(null);
  const hasFiredThisGesture = useRef<boolean>(false);
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch — we only watch scroll events to update activeIndex for playback.
  // We never block or intercept touch. CSS scroll-snap does all the snapping.
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loggedFirstPlayRef = useRef(false);
  const lastPlayIndexRef = useRef<number | null>(null);

  // Keep refs in sync with state so event handlers read the latest values
  // without being recreated on every change.
  useEffect(() => {
    activeIndexRef.current = activeIndex;
    const short = feed[activeIndex];
    if (short) onActiveChange(short);
  }, [activeIndex, feed, onActiveChange]);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const markInteracted = useCallback(() => {
    if (hasUserInteractedRef.current) return;
    hasUserInteractedRef.current = true;
  }, []);

  // Every player has `autoplay-shorts`, so neighbours mounted off-screen try to
  // start on their own once they can. Block play() on any player that isn't the
  // active one — pausing after the fact is too late, because the first `play`
  // event starts a FastPix Data view (inflating views for shorts never seen).
  // activeIndexRef is updated before playAt(), so the active short passes.
  const offscreenGuards = useRef<Record<number, () => void>>({});

  const registerPlayer = useCallback(
    (index: number, player: FastPixPlayerElement | null) => {
      offscreenGuards.current[index]?.();
      delete offscreenGuards.current[index];
      if (!player) {
        delete playerRefsByIndex.current[index];
        return;
      }
      playerRefsByIndex.current[index] = player;
      const vid = player.video;
      if (!vid) return;
      const nativePlay = HTMLMediaElement.prototype.play;
      vid.play = () =>
        activeIndexRef.current === index ? nativePlay.call(vid) : Promise.resolve();
      // Backstop for anything that starts playback without play() (e.g. the
      // native autoplay flag).
      const pauseIfOffscreen = () => {
        if (activeIndexRef.current !== index) vid.pause();
      };
      vid.addEventListener("playing", pauseIfOffscreen);
      offscreenGuards.current[index] = () => {
        Reflect.deleteProperty(vid, "play");
        vid.removeEventListener("playing", pauseIfOffscreen);
      };
    },
    [],
  );

  // Start playback, retrying once on the next frame if the browser rejects
  // the initial play() (e.g. transient autoplay restrictions).
  // Apply the current sound preference: muted before any user gesture
  // (autoplay policy), otherwise the user's choice (persists across swipes).
  const applySound = useCallback((player: FastPixPlayerElement) => {
    if (!hasUserInteractedRef.current || isMutedRef.current) player.mute?.();
    else player.unmute?.();
  }, []);

  const playWithRetry = useCallback(
    (player: FastPixPlayerElement, index: number) => {
      const retry = () => {
        if (activeIndexRef.current === index) player.play?.()?.catch?.(() => {});
      };
      const start = () => {
        const playResult = player.play?.() as Promise<void> | undefined;
        playResult?.catch?.((err: unknown) => {
          perfLog("play() rejected, retrying next frame", { index, error: String(err) });
          // Browser refused playback with sound (e.g. iOS without a fresh
          // gesture): fall back to muted rather than not playing at all.
          if ((err as { name?: string })?.name === "NotAllowedError" && player.video && !player.video.muted) {
            isMutedRef.current = true;
            setIsMuted(true);
            player.mute?.();
          }
          requestAnimationFrame(retry);
        });
      };
      // `autoplay-shorts` players toggle play/pause once on their first
      // `canplay`. A play() issued before that is undone by the toggle (the
      // video gets paused at 0s), so until the video can play, let the
      // player's toggle start it and only step in if it is still paused.
      // The player adds its listener after ours (it awaits hls.js first), so
      // check on the next task, once every canplay handler has run.
      const vid = player.video;
      if (vid && vid.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        vid.addEventListener(
          "canplay",
          () => {
            setTimeout(() => {
              if (activeIndexRef.current !== index) return;
              // The player's own startup may have re-applied its `muted`
              // attribute; restore the viewer's choice before starting.
              applySound(player);
              if (vid.paused) start();
            }, 0);
          },
          { once: true },
        );
        return;
      }
      start();
    },
    [applySound],
  );

  const playAt = useCallback(
    (index: number, options: { resetTime?: boolean; force?: boolean } = {}) => {
      const { resetTime = true, force = false } = options;

      // Avoid re-triggering play for the same index unless explicitly forced.
      if (!force && lastPlayIndexRef.current === index) return;
      // Swiping away ends the previous short's analytics view.
      const previous = lastPlayIndexRef.current;
      if (previous != null && previous !== index) {
        endView(playerRefsByIndex.current[previous]);
      }
      Object.entries(playerRefsByIndex.current).forEach(([i, p]) => {
        const playerEl = p;
        if (!playerEl) return;
        if (Number(i) !== index) {
          playerEl.mute?.();
          playerEl.pause?.();
        }
      });
      const player = playerRefsByIndex.current[index];
      if (!player) return;
      if (resetTime && player.video) player.video.currentTime = 0;
      applySound(player);
      playWithRetry(player, index);

      if (!loggedFirstPlayRef.current) {
        loggedFirstPlayRef.current = true;
        const now = performance.now();
        perfLog("First play() requested", {
          index,
          sinceAppStartMs: Number((now - APP_START_MS).toFixed(1)),
          muted: !hasUserInteractedRef.current || isMutedRef.current,
        });
      }

      lastPlayIndexRef.current = index;
    },
    [playWithRetry, applySound],
  );

  const handleMuteToggle = useCallback(() => {
    const player = playerRefsByIndex.current[activeIndexRef.current];
    if (!player) return;
    if (isMuted) {
      markInteracted();
      player.unmute?.();
      // Unmuting a muted-autoplaying video makes the browser re-check the
      // autoplay policy and it often pauses. We're inside a user gesture here,
      // so an explicit play() is allowed and keeps it running — with sound.
      playWithRetry(player, activeIndexRef.current);
      setIsMuted(false);
    } else {
      player.mute?.();
      setIsMuted(true);
    }
  }, [markInteracted, isMuted, playWithRetry]);

  // Fullscreen the scroll container so scrolling works in fullscreen and progress bar stays visible.
  const handleRequestFullscreen = useCallback(() => {
    const el = scrollRef.current as FullscreenElement | null;
    if (!el) return;
    const doc = document as FullscreenDocument;
    const isFullscreen = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    const action = isFullscreen
      ? (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)
      : (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    // The standard APIs return a promise; swallow rejections (e.g. unsupported).
    Promise.resolve(action).catch((err) => {
      console.warn("Fullscreen not supported", err);
    });
  }, []);

  // Mute preference persists across swipes; we do not reset isMuted when activeIndex changes.

  // ── Wheel snap ────────────────────────────────────────────────────────────────
  // Wheel uses programmatic scrollTo (smooth) — one snap per gesture.
  // CSS scroll-snap handles the final alignment.
  const wheelSnapTo = useCallback((index: number) => {
    const i  = Math.max(0, Math.min(index, feed.length - 1));
    const el = scrollRef.current;
    if (!el) return;

    cancelAnimation.current?.();

    const from = el.scrollTop;
    const to   = i * globalThis.innerHeight;

    activeIndexRef.current = i;
    setActiveIndex(i);
    playAt(i);

    if (from === to) return;

    // Use native scrollTo with smooth behavior — browser handles easing,
    // CSS snap guarantees exact landing, no overflowY toggle needed.
    el.scrollTo({ top: to, behavior: "smooth" });
  }, [playAt, feed.length]);

  const handleScrollPrev = useCallback(() => {
    wheelSnapTo(activeIndexRef.current - 1);
  }, [wheelSnapTo]);
  const handleScrollNext = useCallback(() => {
    wheelSnapTo(activeIndexRef.current + 1);
  }, [wheelSnapTo]);

  // Share: build link to this short, use Web Share API or copy to clipboard
  const handleShare = useCallback(
    (_playbackId: string, metadata: ShortMeta) => {
    const url = `${globalThis.location.origin}${globalThis.location.pathname}${globalThis.location.search}${shareHash(metadata)}`;
    const title = metadata?.title ? `${metadata.title} | @${metadata?.creator ?? ""}` : "Short";
    const text = metadata?.title ?? title;
      if (typeof navigator.share === "function") {
        navigator
          .share({ title, text, url })
          .catch(() => {
            navigator.clipboard?.writeText(url).catch(() => {});
          });
      } else {
        navigator.clipboard?.writeText(url).catch(() => {});
      }
    },
    [shareHash],
  );

  // ── Scroll listener — detects where CSS snap landed ──────────────────────────
  // This is how we know which video to play after a touch swipe snaps.
  // Debounced so it only fires once scroll settles.
  const handleScroll = useCallback(() => {
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
    scrollDebounce.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const i = Math.round(el.scrollTop / globalThis.innerHeight);
      const clamped = Math.max(0, Math.min(i, feed.length - 1));
      if (clamped === activeIndexRef.current) return;
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      playAt(clamped);
    }, 80); // 80ms after scroll stops = snap has settled
  }, [playAt, feed.length]);

  // ── Wheel: one gesture = one video ───────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current);
    wheelIdleTimer.current = setTimeout(() => {
      hasFiredThisGesture.current = false;
    }, WHEEL_IDLE_MS);

    if (hasFiredThisGesture.current) return;
    if (e.deltaY === 0) return;

    hasFiredThisGesture.current = true;
    wheelSnapTo(activeIndexRef.current + (e.deltaY > 0 ? 1 : -1));
  }, [wheelSnapTo]);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    wheelSnapTo(activeIndexRef.current + (e.key === "ArrowDown" ? 1 : -1));
  }, [wheelSnapTo]);

  // Tap anywhere on the feed background (outside the player) to resume playback.
  // Attached imperatively in an effect, mirroring the wheel/scroll/keydown
  // listeners below; keyboard users navigate via the arrow keys (handleKeyDown).
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.("fastpix-player")) return;
      playAt(activeIndexRef.current, { resetTime: false });
    },
    [playAt],
  );

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    perfLog("ShortsApp first render committed", {
      sinceAppStartMs: Number((performance.now() - APP_START_MS).toFixed(1)),
    });
  }, []);
  // Jump straight to the visible short before the first paint.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = initialIndex * globalThis.innerHeight;
    perfLog("Scrolled to initial short", { index: initialIndex });
  }, [initialIndex]);

  // Start the visible short right away (rather than waiting for a scroll), then
  // mount its neighbours once it is playing or after a short fallback delay.
  useEffect(() => {
    const player = playerRefsByIndex.current[initialIndex];
    if (!player) {
      perfLog("Initial player not registered on mount", { index: initialIndex });
      return;
    }
    const vid = player.video;
    const onPlaying = () => {
      perfLog("Mounting neighbours: visible short is playing");
      setNeighborsReady(true);
    };
    const fallback = setTimeout(() => {
      perfLog("Mounting neighbours: fallback timeout hit", {
        afterMs: NEIGHBOR_MOUNT_FALLBACK_MS,
        readyState: vid?.readyState,
        paused: vid?.paused,
      });
      setNeighborsReady(true);
    }, NEIGHBOR_MOUNT_FALLBACK_MS);
    vid?.addEventListener("playing", onPlaying, { once: true });
    playAt(initialIndex, { resetTime: false, force: true });
    return () => {
      clearTimeout(fallback);
      vid?.removeEventListener("playing", onPlaying);
    };
  }, [playAt, initialIndex]);

  useEffect(() => {
    const fn = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = activeIndexRef.current * globalThis.innerHeight;
    };
    globalThis.addEventListener("resize", fn);
    return () => globalThis.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("click", handleContainerClick);
    return () => el.removeEventListener("click", handleContainerClick);
  }, [handleContainerClick]);

  useEffect(() => {
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => () => {
    cancelAnimation.current?.();
    if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current);
    if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100dvh", display: "flex", justifyContent: "center", overflow: "hidden", background: "#000" }}>
      <style precedence="default" href="shorts-styles">{`
        .shorts-scroll::-webkit-scrollbar { display: none; }
        .shorts-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .shorts-scroll:fullscreen,
        .shorts-scroll:-webkit-full-screen {
          width: 100vw;
          height: 100dvh;
          background: #000;
        }
        .short-item fastpix-player {
          --aspect-ratio: 9/16;
          --player-border-radius: 16px;
        }
      `}</style>

      <div style={{ position: "relative", width: "min(100vw, 56.25vh)", height: "100dvh" }}>
        <div
          ref={scrollRef}
          className="shorts-scroll"
          style={{
            width: "100%",
            height: "100%",
            overflowY: "scroll",
            overflowX: "hidden",
            // CSS scroll-snap — handles ALL touch snapping natively.
            // scrollSnapStop: "always" on each item prevents skip-through.
            scrollSnapType: "y mandatory",
            // No scrollBehavior here — we set it per-operation (smooth for wheel,
            // instant for init). Touch uses native physics automatically.
          }}
        >
          <div
            style={{
              position: "relative",
              height: `${feed.length * 100}vh`,
            }}
          >
            {(() => {
              const WINDOW = neighborsReady ? 2 : 0; // current ±2 once playing
              const start = Math.max(0, activeIndex - WINDOW);
              const end = Math.min(feed.length - 1, activeIndex + WINDOW);

              return feed.slice(start, end + 1).map((short, idx) => {
                const i = start + idx;
                return (
                  <div
                    key={short.id}
                    style={{
                      position: "absolute",
                      top: `${i * 100}vh`,
                      left: 0,
                      right: 0,
                      height: "100vh",
                    }}
                  >
                    <ShortItem
                      playbackId={short.id}
                      metadata={short}
                      itemIndex={i}
                      preload={getPreloadFor(i, activeIndex)}
                      registerPlayer={registerPlayer}
                      onToggleMute={handleMuteToggle}
                      isMuted={isMuted}
                      onRequestFullscreen={handleRequestFullscreen}
                      onScrollPrev={handleScrollPrev}
                      onScrollNext={handleScrollNext}
                      onShare={handleShare}
                      isActive={i === activeIndex}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Mute button and controls live on the video overlay (same placement in fullscreen and not) */}
      </div>

      {/* Top HUD */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
          pointerEvents: "none",
      }}>
        {playlist ? (
          // Playlist: back to the episode grid + playlist title.
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, pointerEvents: "auto" }}>
            <button
              type="button"
              aria-label="Back to episodes"
              onClick={() => goBack(playlist.backHash)}
              style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                border: "none", background: "rgba(255,255,255,0.15)", color: "#fff",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span style={{
              color: "#fff", fontSize: 15, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,0.6)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {playlist.title}
            </span>
          </div>
        ) : (
          <>
            {/* Logo / brand */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img
                src="https://dashboard.fastpix.io/images/fastpix.png"
                alt="FastPix"
                style={{ height: 24, width: "auto", objectFit: "contain" }}
              />
            </div>

            <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "auto" }}>
              <FeedTabs active="forYou" />
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
          {/* Counter pill */}
          <div style={{
            padding: "4px 10px", borderRadius: 20,
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>
              {playlist ? "Ep " : ""}{activeIndex + 1} <span style={{ opacity: 0.5 }}>/ {feed.length}</span>
          </span>
          </div>
        </div>
      </div>

      {/* Vertical dot rail (right side, centered) */}
      <div style={{
        position: "fixed", right: 20, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 6,
        pointerEvents: "none", zIndex: 10,
      }}>
        {feed.map((short, i) => (
          <div key={short.id} style={{
            width: 4,
            height: i === activeIndex ? 24 : 8,
            borderRadius: 4,
            background: i === activeIndex ? "#b16cea" : "rgba(255,255,255,0.35)",
            transition: "height 0.25s ease, background 0.25s ease",
          }} />
        ))}
      </div>
    </div>
  );
}