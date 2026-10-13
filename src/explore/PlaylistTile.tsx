import type { Playlist } from "../shorts/types";
import { PlaylistIcon } from "./PlaylistIcon";
import { navigate, playlistHash } from "./routes";
import { Thumbnail } from "./Thumbnail";

// Playlist entry: first episode's thumbnail (static) with a playlist badge.
export function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const first = playlist.episodes[0];
  return (
    <button
      type="button"
      aria-label={`Open playlist ${playlist.title}, ${playlist.episodes.length} episodes`}
      onClick={() => {
        navigate(playlistHash(playlist));
      }}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "9 / 16",
        padding: 0,
        border: "none",
        borderRadius: 12,
        overflow: "hidden",
        background: "#151515",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {first && <Thumbnail playbackId={first.id} eager />}
      {/* Playlist badge */}
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 8px",
          borderRadius: 14,
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <PlaylistIcon size={14} />
        {playlist.episodes.length}
      </span>
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "28px 10px 10px",
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{playlist.title}</span>
        <span style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 5 }}>
          <PlaylistIcon size={12} />
          Playlist · {playlist.episodes.length} episodes
        </span>
      </span>
    </button>
  );
}
