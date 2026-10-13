// Explore grid: every short as a tile that autoplays muted and loops while on
// screen (Flipkart Play / Instagram Explore style). Tapping a tile opens that
// short in the For You feed; tapping its speaker button instead unmutes it in
// place (one tile with sound at a time).
//
// Tiles are plain <video> elements driven by hls.js at the lowest rendition,
// not full FastPix players: a grid of players would be heavy, and previews
// shouldn't count as FastPix Data views.

import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYLISTS, SHORTS_FEED, type ShortMeta } from "../shorts/types";
import { loadHls, type HlsInstance } from "../shorts/hls";
import { masterUrl, startupHlsConfig } from "../shorts/startup";
import { thumbnailUrl } from "../shorts/utils";
import { gridStyle, pageStyle } from "./layout";
import { PlaylistTile } from "./PlaylistTile";
import { navigate } from "./routes";
import { carrySoundIntoFeed } from "../shorts/soundPreference";
import { TabsHeader } from "./TabsHeader";

// Lowest rendition (270p) is plenty for a tile and keeps several streams cheap.
const PREVIEW_HLS_CONFIG = {
  startLevel: 0,
  capLevelToPlayerSize: true,
  testBandwidth: false,
  maxBufferLength: 8,
  maxMaxBufferLength: 8,
};

const SpeakerOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const SpeakerOnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

type ExploreTileProps = {
  short: ShortMeta;
  unmuted: boolean;
  // Any tile has sound on: opening a short keeps sound on in the feed.
  soundOn: boolean;
  onToggleSound: (id: string) => void;
};

function ExploreTile({ short, unmuted, soundOn, onToggleSound }: ExploreTileProps) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const hlsRef = useRef<HlsInstance | null>(null);
  const attachedRef = useRef(false);
  const unmountedRef = useRef(false);
  // Latest visibility for async callbacks.
  const visibleRef = useRef(false);

  // Track whether the tile is on screen; only on-screen tiles load and play.
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  // Attach the stream the first time the tile becomes visible. Prefer hls.js
  // even where the browser plays HLS natively (Safari, recent Chrome): native
  // playback picks its own (high) rendition, hls.js lets us pin the lowest.
  useEffect(() => {
    const video = videoRef.current;
    if (!visible || !video || attachedRef.current) return;
    attachedRef.current = true;
    loadHls().then((Hls) => {
      if (unmountedRef.current) return;
      if (Hls?.isSupported()) {
        const hls = new Hls({ ...startupHlsConfig(short.id), ...PREVIEW_HLS_CONFIG });
        // Keep ABR from switching up: tiles stay on the lowest rendition.
        hls.autoLevelCapping = 0;
        hls.attachMedia(video);
        hls.loadSource(masterUrl(short.id));
        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = masterUrl(short.id);
      } else {
        return;
      }
      if (visibleRef.current) video.play().catch(() => {});
    });
  }, [visible, short.id]);

  // Play while visible, pause when scrolled away.
  useEffect(() => {
    visibleRef.current = visible;
    const video = videoRef.current;
    if (!video) return;
    if (visible) video.play().catch(() => {});
    else video.pause();
  }, [visible]);

  // Mute whenever another tile takes the sound (the unmute itself happens in
  // the click handler, inside the user gesture).
  useEffect(() => {
    const video = videoRef.current;
    if (video && !unmuted) video.muted = true;
  }, [unmuted]);

  useEffect(() => {
    const video = videoRef.current;
    // React doesn't reliably reflect `muted` to the DOM property; autoplay
    // policies need the property.
    if (video) video.muted = true;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const toggleSound = () => {
    const video = videoRef.current;
    if (video && !unmuted) {
      // Unmute + play synchronously in the click so autoplay policy allows it.
      video.muted = false;
      video.play().catch(() => {});
    }
    onToggleSound(short.id);
  };

  return (
    <div
      ref={tileRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "9 / 16",
        borderRadius: 12,
        overflow: "hidden",
        background: "#151515",
      }}
    >
      <button
        type="button"
        aria-label={`Play ${short.title} by @${short.creator}`}
        onClick={() => {
          carrySoundIntoFeed(soundOn);
          navigate(`#short/${encodeURIComponent(short.id)}`);
        }}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          width: "100%",
          height: "100%",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          onPlaying={() => setPlaying(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* First-frame poster until the preview is actually playing. */}
        <img
          src={thumbnailUrl(short.id)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: playing ? 0 : 1,
            transition: "opacity 0.2s ease",
            pointerEvents: "none",
          }}
        />
        {/* Title + creator + likes */}
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "28px 10px 10px",
            background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {short.title}
          </span>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              @{short.creator}
            </span>
            <span style={{ flexShrink: 0 }}>♥ {short.likes}</span>
          </span>
        </span>
      </button>
      {/* Sound toggle: unmutes this tile in place instead of opening it. */}
      <button
        type="button"
        aria-label={unmuted ? `Mute ${short.title}` : `Unmute ${short.title}`}
        aria-pressed={unmuted}
        onClick={toggleSound}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 34,
          height: 34,
          padding: 0,
          border: "none",
          borderRadius: "50%",
            background: "rgba(0,0,0,0.5)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {unmuted ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
      </button>
    </div>
  );
}

export default function ExplorePage() {
  // Only one tile plays with sound; unmuting another mutes the previous one.
  const [unmutedId, setUnmutedId] = useState<string | null>(null);
  const toggleSound = useCallback(
    (id: string) => setUnmutedId((current) => (current === id ? null : id)),
    [],
  );

  return (
    <div style={pageStyle}>
      <TabsHeader active="explore" />
      <main style={gridStyle}>
        {PLAYLISTS.map((playlist) => (
          <PlaylistTile key={playlist.id} playlist={playlist} />
        ))}
        {SHORTS_FEED.map((short) => (
          <ExploreTile
            key={short.id}
            short={short}
            unmuted={unmutedId === short.id}
            soundOn={unmutedId !== null}
            onToggleSound={toggleSound}
          />
        ))}
      </main>
    </div>
  );
}
