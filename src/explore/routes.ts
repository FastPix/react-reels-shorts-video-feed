// Hash routes for the Explore area.
//   #explore                          → Explore grid
//   #playlists                        → Playlists tab
//   #playlist/<id>                    → playlist episode grid
//   #playlist/<id>/ep/<episodeId>     → player scoped to that playlist
//   anything else                     → For You feed

import { PLAYLISTS, type Playlist, type ShortMeta } from "../shorts/types";

export const playlistHash = (playlist: Playlist) =>
  `#playlist/${encodeURIComponent(playlist.id)}`;

export const episodeHash = (playlist: Playlist, episode: ShortMeta) =>
  `${playlistHash(playlist)}/ep/${encodeURIComponent(episode.id)}`;

// Forward navigation inside the app. Marks the history entry so the in-app
// back buttons can return with history.back() (keeping browser history clean).
export function navigate(hash: string) {
  history.pushState({ inApp: true }, "", hash);
  globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
}

// In-app back: pop the entry if we navigated here inside the app, otherwise
// (deep link / fresh tab) replace it with the parent page.
export function goBack(fallbackHash: string) {
  if ((history.state as { inApp?: boolean } | null)?.inApp) history.back();
  else globalThis.location.replace(fallbackHash);
}

export type Route =
  | { kind: "feed" }
  | { kind: "explore" }
  | { kind: "playlists" }
  | { kind: "playlist"; playlist: Playlist }
  | { kind: "episode"; playlist: Playlist; index: number };

export function parseRoute(hash: string): Route {
  if (hash === "#explore") return { kind: "explore" };
  if (hash === "#playlists") return { kind: "playlists" };
  const match = /^#playlist\/([^/]+)(?:\/ep\/([^/]+))?$/.exec(hash);
  if (!match) return { kind: "feed" };
  const playlist = PLAYLISTS.find((p) => p.id === decodeURIComponent(match[1]));
  if (!playlist) return { kind: "playlists" };
  if (!match[2]) return { kind: "playlist", playlist };
  const episodeId = decodeURIComponent(match[2]);
  const index = Math.max(0, playlist.episodes.findIndex((e) => e.id === episodeId));
  return { kind: "episode", playlist, index };
}
