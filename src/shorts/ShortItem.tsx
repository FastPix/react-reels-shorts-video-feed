import { useEffect, useRef, useState } from "react";
import { ActionBtn } from "./ActionButton";
import { incrementLabel, perfLog, posterUrl } from "./utils";
import { skipPlayerValidation, startupHlsConfig } from "./startup";
import type {
  FastPixPlayerElement,
  FullscreenDocument,
  ShortMeta,
  SubtitleCueDetail,
  TrackChangeDetail,
  TrackInfo,
  TracksReadyDetail,
} from "./types";

// The player shows its spinner with an inline `display: block`, which beats its
// own `--loading-indicator` variable, so we add an !important rule to its
// (open) shadow root. While the host has this attribute — i.e. until the short
// is actually playing and our first-frame poster is covering the player — no
// spinner shows. Later buffering still shows it.
const HIDE_LOADER_ATTR = "data-hide-loader";
const HIDE_LOADER_CSS = `:host([${HIDE_LOADER_ATTR}]) .spinner { display: none !important; }`;

// FastPix Data (analytics). The player reads the metadata-* attributes once,
// when it connects, so they must be set before appendChild.
const WORKSPACE_KEY = import.meta.env.VITE_FASTPIX_WORKSPACE_KEY?.trim();

// Last bandwidth estimate (bps) measured by any player. Each player has its own
// hls.js instance, so without this every new short re-measures from scratch.
let lastBandwidthEstimate: number | undefined;

// Assumed bandwidth for the very first short, before anything is measured.
// ~2.5 Mbps makes hls.js start at 480p (~825 KB first segment) instead of
// bitrate-testing at 270p and then fetching a ~2 MB 1080p segment.
const DEFAULT_BANDWIDTH_ESTIMATE = 2_500_000;

// Off-screen players only buffer about one segment, so they don't fight the
// visible short for bandwidth.
const ACTIVE_MAX_BUFFER_S = 30;
const NEIGHBOR_MAX_BUFFER_S = 4;
const maxBufferFor = (preload: ShortItemProps["preload"]) =>
  preload === "auto" ? ACTIVE_MAX_BUFFER_S : NEIGHBOR_MAX_BUFFER_S;

function rememberBandwidth(player: FastPixPlayerElement) {
  const bw = player.hls?.bandwidthEstimate;
  if (typeof bw === "number" && Number.isFinite(bw) && bw > 0) {
    lastBandwidthEstimate = bw;
  }
}

export type ShortItemProps = {
  playbackId: string;
  metadata: ShortMeta;
  itemIndex: number;
  preload: "none" | "metadata" | "auto";
  registerPlayer: (index: number, player: FastPixPlayerElement | null) => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onRequestFullscreen: () => void;
  onScrollPrev: () => void;
  onScrollNext: () => void;
  onShare: (playbackId: string, metadata: ShortMeta) => void;
  isActive: boolean;
};

export const ShortItem: React.FC<ShortItemProps> = ({
  playbackId,
  metadata,
  itemIndex,
  preload,
  registerPlayer,
  onToggleMute,
  isMuted,
  onRequestFullscreen,
  onScrollPrev,
  onScrollNext,
  onShare,
  isActive,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<FastPixPlayerElement | null>(null);
  const [liked, setLiked] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [accentColor, setAccentColor] = useState("#5D09C7");
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([]);
  const [showTrackMenu, setShowTrackMenu] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  // True while the player's seek-thumbnail (spritesheet) preview tile is on
  // screen. The tile lives in the player's shadow DOM, so our overlays (which
  // are siblings of the player) always stack above it — instead, every overlay
  // that can cover it fades out while it shows.
  const [previewActive, setPreviewActive] = useState(false);
  // First-frame poster shown over the player until real frames are playing, so
  // the screen is never black/spinning while the stream starts.
  const [posterVisible, setPosterVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || playerRef.current) return;

    const el = document.createElement(
      "fastpix-player",
    ) as FastPixPlayerElement;
    el.setAttribute("playback-id", playbackId);
    el.setAttribute("autoplay-shorts", "");
    // Start muted unless the viewer already turned sound on.
    if (isMuted) el.setAttribute("muted", "");
    el.setAttribute("loop", "");
    el.setAttribute("disable-keyboard-controls", "");
    el.setAttribute("preload", preload);
    // Mirror demo behavior: keep native subtitles hidden and, optionally,
    // start with subtitles Off while still emitting fastpixsubtitlecue.
    el.setAttribute("hide-native-subtitles", "");
    el.setAttribute(HIDE_LOADER_ATTR, "");
    if (WORKSPACE_KEY) {
      el.setAttribute("metadata-workspace-key", WORKSPACE_KEY);
      el.setAttribute("metadata-video-id", playbackId);
      el.setAttribute("metadata-video-title", metadata.title);
      el.setAttribute("metadata-video-producer", metadata.creator);
      el.setAttribute("metadata-player-name", "fastpix-shorts-demo");
      if (metadata.series) el.setAttribute("metadata-video-series", metadata.series);
    }
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.objectFit = "cover";
    // The player builds its hls.js instance from `el.config` on connect, so
    // startup tuning has to be applied before appendChild.
    const startEstimate = lastBandwidthEstimate ?? DEFAULT_BANDWIDTH_ESTIMATE;
    el.config = {
      ...el.config,
      // Skip the throwaway bitrate-test segment; pick the start level from the
      // estimate instead.
      testBandwidth: false,
      abrEwmaDefaultEstimate: startEstimate,
      maxBufferLength: maxBufferFor(preload),
      // The player switches to the audio track named "default" right after the
      // manifest parses. hls.js would otherwise start on track 0, and when
      // segments arrive instantly (cache) that switch aborts in-flight loads
      // and the buffer never fills. Starting on the same track avoids the switch.
      audioPreference: { name: "default" },
      // Serve snapshot/prefetched playlists from memory (see startup.ts).
      ...startupHlsConfig(playbackId),
    };
    skipPlayerValidation(el, playbackId);
    container.appendChild(el);
    playerRef.current = el;
    perfLog(`Player created #${itemIndex}`, {
      playbackId,
      preload,
      startBandwidthEstimate: startEstimate,
      hlsAlreadyLoaded: "Hls" in globalThis,
    });

    // Startup milestones for this player's <video>. One-shot events log once;
    // waiting/stalled log every time so rebuffering shows up too.
    const createdAt = performance.now();
    const vidEl = el.video;
    const milestoneCleanups: Array<() => void> = [];
    if (vidEl) {
      const track = (type: string, once: boolean) => {
        const handler = () =>
          perfLog(`#${itemIndex} video ${type}`, {
            sincePlayerCreatedMs: Number((performance.now() - createdAt).toFixed(1)),
            readyState: vidEl.readyState,
            buffered: vidEl.buffered.length ? vidEl.buffered.end(0).toFixed(2) : 0,
            resolution: vidEl.videoWidth ? `${vidEl.videoWidth}x${vidEl.videoHeight}` : undefined,
          });
        vidEl.addEventListener(type, handler, { once });
        milestoneCleanups.push(() => vidEl.removeEventListener(type, handler));
      };
      // loadeddata = first frame decoded; playing = frames actually advancing.
      ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing"].forEach((t) => track(t, true));
      ["waiting", "stalled", "error"].forEach((t) => track(t, false));
      const onPlayingRemember = () => {
        rememberBandwidth(el);
        setPosterVisible(false);
        el.removeAttribute(HIDE_LOADER_ATTR);
      };
      vidEl.addEventListener("playing", onPlayingRemember);
      milestoneCleanups.push(() => vidEl.removeEventListener("playing", onPlayingRemember));
    } else {
      perfLog(`#${itemIndex} player has no video element yet`);
    }
    if (playerRef.current?.video)
      playerRef.current.video.setAttribute("playback-rate", "3");
    registerPlayer(itemIndex, el);

    // The player renders its seek-thumbnail (spritesheet) preview inside an
    // open shadow root and tags the tile with a "show" class while visible.
    // Watch for it so we can fade our creator overlay out of the way — the
    // overlay can't be interleaved with the shadow-DOM tile via z-index alone.
    let previewObserver: MutationObserver | null = null;
    let observeRaf: number | null = null;
    let observeTries = 0;
    const attachPreviewObserver = () => {
      const root = el.shadowRoot;
      if (!root) {
        if (observeTries++ < 30) observeRaf = requestAnimationFrame(attachPreviewObserver);
        return;
      }
      const loaderStyle = document.createElement("style");
      loaderStyle.textContent = HIDE_LOADER_CSS;
      root.appendChild(loaderStyle);
      const sync = () => {
        const tile = root.querySelector(".thumbnailSeeking");
        setPreviewActive(!!tile && tile.classList.contains("show"));
      };
      previewObserver = new MutationObserver(sync);
      previewObserver.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
      sync();
    };
    attachPreviewObserver();

    return () => {
      milestoneCleanups.forEach((fn) => fn());
      rememberBandwidth(el);
      perfLog(`Player destroyed #${itemIndex}`);
      if (observeRaf != null) cancelAnimationFrame(observeRaf);
      previewObserver?.disconnect();
      registerPlayer(itemIndex, null);
      try {
        if (typeof el.destroy === "function") el.destroy();
      } catch {
        // ignore
      }
      el.remove();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackId, itemIndex, registerPlayer]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.setAttribute("preload", preload);
    if (player.video) player.video.preload = preload;
    // hls.js reads maxBufferLength live, so this takes effect on the next tick.
    if (player.hls?.config) player.hls.config.maxBufferLength = maxBufferFor(preload);
  }, [preload]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(
        !!doc.fullscreenElement || !!doc.webkitFullscreenElement,
      );
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const vid = player?.video;
    if (!vid) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    setIsPlaying(!vid.paused);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    return () => {
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
    };
  }, [playbackId]);

  // Log fastpixsubtitlecue and keep a styled overlay in sync — only for the active short
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isActive) {
      // If this short is not active, clear any old text and skip attaching.
      setSubtitleText("");
      return;
    }

    const handleCue = (e: Event) => {
      const detail = (e as CustomEvent<SubtitleCueDetail>).detail ?? {};
      const text = detail.text ?? "";

      // Helpful log for debugging / QA
      console.log("[fastpixsubtitlecue]", {
        text,
        language: detail.language,
        startTime: detail.startTime,
        endTime: detail.endTime,
        playbackId,
      });

      setSubtitleText(text);
    };

    player.addEventListener("fastpixsubtitlecue", handleCue);
    return () => {
      player.removeEventListener("fastpixsubtitlecue", handleCue);
    };
  }, [playbackId, isActive]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const read = () => {
      const fromAttr = player.getAttribute("accent-color");
      if (fromAttr) {
        setAccentColor(fromAttr);
        return;
      }
      const fromStyle = getComputedStyle(player)
        .getPropertyValue("--accent-color")
        .trim();
      if (fromStyle) setAccentColor(fromStyle);
    };
    read();
    const t = setTimeout(read, 100);
    return () => clearTimeout(t);
  }, [playbackId]);

  useEffect(() => {
    const player = playerRef.current;
    const vid = player?.video;
    if (!vid) return;

    const paint = () => {
      const duration = vid.duration;
      if (duration > 0 && Number.isFinite(duration)) {
        setProgress((vid.currentTime / duration) * 100);
      } else {
        setProgress(0);
      }
    };

    let rafId: number | null = null;
    const loop = () => {
      paint();
      rafId = requestAnimationFrame(loop);
    };
    const startRAF = () => {
      rafId ??= requestAnimationFrame(loop);
    };
    const stopRAF = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      paint();
    };

    paint();
    vid.addEventListener("play", startRAF);
    vid.addEventListener("playing", startRAF);
    vid.addEventListener("pause", stopRAF);
    vid.addEventListener("ended", stopRAF);
    vid.addEventListener("seeking", paint);
    vid.addEventListener("seeked", paint);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      vid.removeEventListener("play", startRAF);
      vid.removeEventListener("playing", startRAF);
      vid.removeEventListener("pause", stopRAF);
      vid.removeEventListener("ended", stopRAF);
      vid.removeEventListener("seeking", paint);
      vid.removeEventListener("seeked", paint);
    };
  }, []);

  // Track switching: read available tracks and keep state in sync with FastPix events.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const readAudioTracks = () => player.getAudioTracks?.() ?? [];
    const readSubtitleTracks = () => player.getSubtitleTracks?.() ?? [];

    const handleTracksReady = (e: Event) => {
      const detail = (e as CustomEvent<TracksReadyDetail>).detail ?? {};
      const aud = detail.audioTracks ?? readAudioTracks();
      const subs = detail.subtitleTracks ?? readSubtitleTracks();

      console.log("[fastpixtracksready]", {
        playbackId,
        detail,
        audioTracks: Array.isArray(aud) ? aud : [],
        subtitleTracks: Array.isArray(subs) ? subs : [],
      });

      setAudioTracks(Array.isArray(aud) ? aud : []);
      setSubtitleTracks(Array.isArray(subs) ? subs : []);
    };

    const handleAudioChange = (e: Event) => {
      const detail = (e as CustomEvent<TrackChangeDetail>).detail ?? {};
      const tracks = detail.tracks ?? readAudioTracks();
      setAudioTracks(Array.isArray(tracks) ? tracks : []);
    };

    const handleSubtitleChange = (e: Event) => {
      const detail = (e as CustomEvent<TrackChangeDetail>).detail ?? {};
      const tracks = detail.tracks ?? readSubtitleTracks();
      const resolvedTracks = Array.isArray(tracks) ? tracks : [];
      setSubtitleTracks(resolvedTracks);

      // Clear overlay when subtitles are turned Off so stale cue text disappears.
      const hasCurrentTrack =
        !!detail.currentTrack || resolvedTracks.some((t) => t?.isCurrent);
      if (!hasCurrentTrack) {
        setSubtitleText("");
      }
    };

    player.addEventListener("fastpixtracksready", handleTracksReady);
    player.addEventListener("fastpixaudiochange", handleAudioChange);
    player.addEventListener("fastpixsubtitlechange", handleSubtitleChange);

    // Initial snapshot in case events fired before React effect attached.
    const initialAudio = readAudioTracks();
    if (initialAudio.length) setAudioTracks(initialAudio);
    const initialSubs = readSubtitleTracks();
    if (initialSubs.length) setSubtitleTracks(initialSubs);

    return () => {
      player.removeEventListener("fastpixtracksready", handleTracksReady);
      player.removeEventListener("fastpixaudiochange", handleAudioChange);
      player.removeEventListener("fastpixsubtitlechange", handleSubtitleChange);
    };
  }, [playbackId]);

  const hasAudioChoices = audioTracks.length > 1;
  const hasSubtitles = subtitleTracks.length > 0;
  const currentSubtitle = subtitleTracks.find((t) => t.isCurrent) ?? null;

  const switchAudio = (label: string) => {
    playerRef.current?.setAudioTrack?.(label);
  };

  const switchSubtitle = (labelOrNull: string | null) => {
    const player = playerRef.current;
    if (!player) return;

    if (labelOrNull == null) {
      if (typeof player.disableAllSubtitles === "function") {
        player.disableAllSubtitles();
      } else if (typeof player.setSubtitleTrack === "function") {
        // Fallback for older SDKs.
        player.setSubtitleTrack(null);
      }
      // Optimistically clear custom overlay on "Off" click.
      setSubtitleText("");
      return;
    }

    if (typeof player.setSubtitleTrack === "function") {
      player.setSubtitleTrack(labelOrNull);
    }
  };

  const likeCount = liked
    ? incrementLabel(metadata.likes)
    : metadata.likes;

  // Seek-preview tile takes precedence: overlays near it fade out and stop
  // catching the pointer while it shows.
  const hiddenDuringPreview: React.CSSProperties = {
    opacity: previewActive ? 0 : 1,
    transition: "opacity 0.15s ease",
    pointerEvents: previewActive ? "none" : undefined,
  };

  const topBarBtnStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        flexShrink: 0,
        scrollSnapAlign: "start",
        scrollSnapStop: "always",
        padding: "10px 8px",
        boxSizing: "border-box",
        background: "transparent",
      }}
    >
      <div
        className="short-item"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#000",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0 }}
        />
        <img
          src={posterUrl(playbackId)}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority={isActive ? "high" : "low"}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
            pointerEvents: "none",
            opacity: posterVisible && !previewActive ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />

        {/* Top bar (play/pause, mute, fullscreen) */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 0,
            right: 0,
            height: 48,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const vid = playerRef.current?.video;
                if (vid) {
                  if (vid.paused) vid.play();
                  else vid.pause();
                }
              }}
              aria-label={isPlaying ? "Pause" : "Play"}
              style={topBarBtnStyle}
            >
              {isPlaying ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute?.();
              }}
              aria-label={isMuted ? "Unmute" : "Mute"}
              style={topBarBtnStyle}
            >
              {isMuted ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestFullscreen?.();
              }}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              style={{ ...topBarBtnStyle, justifyContent: "center", alignItems: "center" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isFullscreen ? "rotate(180deg)" : "none" }}
              >
                {/* classic expand icon; rotated 180° for exit */}
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>

            {(hasAudioChoices || hasSubtitles) && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTrackMenu((v) => !v);
                  }}
                  aria-label="Track settings"
                  style={topBarBtnStyle}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
                {showTrackMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: 48,
                      right: 0,
                      minWidth: 180,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.85)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      boxShadow: "0 8px 16px rgba(0,0,0,0.6)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      pointerEvents: "auto",
                    }}
                  >
                    {hasAudioChoices && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          Audio
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                          }}
                        >
                          {audioTracks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                switchAudio(t.label);
                                setShowTrackMenu(false);
                              }}
                              style={{
                                padding: "3px 6px",
                                borderRadius: 8,
                                border: t.isCurrent
                                  ? "2px solid rgba(255,255,255,0.9)"
                                  : "1px solid rgba(255,255,255,0.4)",
                                background: t.isCurrent
                                  ? "rgba(255,255,255,0.12)"
                                  : "transparent",
                                color: "#fff",
                                fontSize: 11,
                              }}
                            >
                              {t.label}
                              {t.language ? ` (${t.language})` : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasSubtitles && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: "rgba(255,255,255,0.6)",
                            marginTop: hasAudioChoices ? 4 : 0,
                          }}
                        >
                          Subtitles
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 4,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              switchSubtitle(null);
                              setShowTrackMenu(false);
                            }}
                            style={{
                              padding: "3px 6px",
                              borderRadius: 8,
                              border: currentSubtitle
                                ? "1px solid rgba(255,255,255,0.4)"
                                : "2px solid rgba(255,255,255,0.9)",
                              background: currentSubtitle
                                ? "transparent"
                                : "rgba(255,255,255,0.12)",
                              color: "#fff",
                              fontSize: 11,
                            }}
                          >
                            Off
                          </button>
                          {subtitleTracks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                switchSubtitle(t.label);
                                setShowTrackMenu(false);
                              }}
                              style={{
                                padding: "3px 6px",
                                borderRadius: 8,
                                border: t.isCurrent
                                  ? "2px solid rgba(255,255,255,0.9)"
                                  : "1px solid rgba(255,255,255,0.4)",
                                background: t.isCurrent
                                  ? "rgba(255,255,255,0.12)"
                                  : "transparent",
                                color: "#fff",
                                fontSize: 11,
                              }}
                            >
                              {t.label}
                              {t.language ? ` (${t.language})` : ""}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Creator + title — fades out while the spritesheet preview shows */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 16,
            right: 72,
            zIndex: 2,
            userSelect: "none",
            ...hiddenDuringPreview,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #b16cea 0%, #5d09c7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {metadata.creator.charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                @{metadata.creator}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFollowed((v) => !v)}
              style={{
                pointerEvents: "auto",
                padding: "6px 0",
                width: 120, // fixed width so Subscribe/Following don't shift layout
                borderRadius: 18,
                border: "none",
                background: "rgba(255,255,255,0.2)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "center",
                transition: "background 0.2s, color 0.2s, transform 0.15s",
              }}
            >
              {followed ? "Following" : "Subscribe"}
            </button>
          </div>
          <p
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.9)",
              fontSize: 13,
              lineHeight: 1.4,
              textShadow: "0 1px 4px rgba(0,0,0,0.8)",
              pointerEvents: "none",
            }}
          >
            {metadata.episode != null && (
              <span
                style={{
                  display: "inline-block",
                  marginRight: 6,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.22)",
                  fontSize: 11,
                  fontWeight: 700,
                  textShadow: "none",
                }}
              >
                Ep {metadata.episode}
              </span>
            )}
            {metadata.title}
          </p>
        </div>

        {/* Custom subtitle overlay driven by fastpixsubtitlecue */}
        {subtitleText && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "100px",
              transform: "translateX(-50%)",
              maxWidth: "80%",
              padding: "6px 12px",
              borderRadius: 10,
              background: "rgba(0, 0, 0, 0.75)",
              color: "#fff",
              fontSize: 14,
              lineHeight: 1.4,
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 3,
              boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
              ...hiddenDuringPreview,
            }}
          >
            {subtitleText}
          </div>
        )}

        {/* Progress bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 20,
            right: 20,
            height: 3,
            zIndex: 3,
            background: "rgba(255,255,255,0.2)",
            borderRadius: "0 0 16px 16px",
            ...hiddenDuringPreview,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: accentColor,
              borderRadius: "inherit",
              transition: "none",
            }}
          />
        </div>

        {/* Right column: scroll arrows + actions */}
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 32,
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 16,
            ...hiddenDuringPreview,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onScrollPrev?.();
            }}
            aria-label="Previous short"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(10px)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>↑</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onScrollNext?.();
            }}
            aria-label="Next short"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(10px)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>↓</span>
          </button>
          <ActionBtn
            icon="♥"
            label={likeCount}
            active={liked}
            onClick={() => setLiked((v) => !v)}
          />
          <ActionBtn
            useShareIcon
            label="Share"
            onClick={() => onShare?.(playbackId, metadata)}
          />
          <ActionBtn
            icon={followed ? "✓" : "+"}
            label={followed ? "Following" : "Follow"}
            active={followed}
            onClick={() => setFollowed((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
};
