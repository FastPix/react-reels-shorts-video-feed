// Episode grid for one playlist (#playlist/<id>). Tapping an episode opens the
// vertical player scoped to this playlist (#playlist/<id>/ep/<episodeId>), so
// scrolling moves between this playlist's episodes only.

import type { Playlist, ShortMeta } from "../shorts/types";
import { gridStyle, pageStyle } from "./layout";
import { Thumbnail } from "./Thumbnail";
import { PlaylistIcon } from "./PlaylistIcon";
import { episodeHash, goBack, navigate } from "./routes";
import { carrySoundIntoFeed } from "../shorts/soundPreference";

function EpisodeCard({ playlist, episode }: { playlist: Playlist; episode: ShortMeta }) {
  return (
    <button
      type="button"
      aria-label={`Episode ${episode.episode}: ${episode.title}`}
      onClick={() => {
        // Choosing an episode is an explicit "watch this": start with sound.
        carrySoundIntoFeed(true);
        navigate(episodeHash(playlist, episode));
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 0,
        border: "none",
        background: "none",
        color: "#fff",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          aspectRatio: "9 / 16",
          borderRadius: 12,
          overflow: "hidden",
          background: "#151515",
        }}
      >
        <Thumbnail playbackId={episode.id} />
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            padding: "3px 8px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.65)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          Ep {episode.episode}
        </span>
      </span>
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
        {episode.title}
      </span>
    </button>
  );
}

export default function PlaylistPage({ playlist }: { playlist: Playlist }) {
  return (
    <div style={pageStyle}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <button
          type="button"
          aria-label="Back"
          onClick={() => goBack("#playlists")}
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {playlist.title}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 6 }}>
            <PlaylistIcon size={12} />
            {playlist.episodes.length} episodes · @{playlist.creator}
          </p>
        </div>
      </header>
      <main style={{ ...gridStyle, padding: "12px 16px 24px", rowGap: 16 }}>
        {playlist.episodes.map((episode) => (
          <EpisodeCard key={episode.id} playlist={playlist} episode={episode} />
        ))}
      </main>
    </div>
  );
}
