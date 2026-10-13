// Playlists tab (#playlists): every playlist as a tile; tapping one opens its
// episode grid.

import { PLAYLISTS } from "../shorts/types";
import { gridStyle, pageStyle } from "./layout";
import { PlaylistTile } from "./PlaylistTile";
import { TabsHeader } from "./TabsHeader";

export default function PlaylistsPage() {
  return (
    <div style={pageStyle}>
      <TabsHeader active="playlists" />
      <main style={gridStyle}>
        {PLAYLISTS.map((playlist) => (
          <PlaylistTile key={playlist.id} playlist={playlist} />
        ))}
      </main>
    </div>
  );
}
