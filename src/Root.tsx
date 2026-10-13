import { useCallback, useEffect, useState } from "react";
import ShortsApp from "./App";
import ExplorePage from "./explore/ExplorePage";
import PlaylistPage from "./explore/PlaylistPage";
import PlaylistsPage from "./explore/PlaylistsPage";
import { episodeHash, parseRoute, playlistHash } from "./explore/routes";
import type { Playlist, ShortMeta } from "./shorts/types";

const currentRoute = () => parseRoute(globalThis.location.hash);

// Player scoped to one playlist: scrolling stays within its episodes, and the
// URL follows the visible episode so refresh/back land on it.
function PlaylistFeed({ playlist, index }: { playlist: Playlist; index: number }) {
  const onActiveChange = useCallback(
    (episode: ShortMeta) => {
      history.replaceState(history.state, "", episodeHash(playlist, episode));
    },
    [playlist],
  );
  const shareHash = useCallback((episode: ShortMeta) => episodeHash(playlist, episode), [playlist]);
  return (
    <ShortsApp
      feed={playlist.episodes}
      initialIndex={index}
      onActiveChange={onActiveChange}
      shareHash={shareHash}
      playlist={{ title: playlist.title, backHash: playlistHash(playlist) }}
    />
  );
}

export default function Root() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    globalThis.addEventListener("hashchange", onHashChange);
    return () => globalThis.removeEventListener("hashchange", onHashChange);
  }, []);

  switch (route.kind) {
    case "explore":
      return <ExplorePage />;
    case "playlists":
      return <PlaylistsPage />;
    case "playlist":
      return <PlaylistPage key={route.playlist.id} playlist={route.playlist} />;
    case "episode":
      return <PlaylistFeed key={route.playlist.id} playlist={route.playlist} index={route.index} />;
    default:
      return <ShortsApp key="feed" />;
  }
}
