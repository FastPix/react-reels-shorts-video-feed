// FastPix Data view lifecycle for a shorts feed.
//
// The player's Data SDK only closes a view on page unload or player destroy.
// In a feed, shorts the user swiped past stay mounted (paused), so their views
// would stay open until the tab closes. Like Shorts/Reels, we treat each
// swipe away as the end of that view: a "videoChange" event completes it and
// resets the view state, so coming back to the short starts a fresh view.

import type { FastPixPlayerElement } from "./types";

type Metrix = { dispatch: (key: string, event: string, data?: Record<string, unknown>) => void };

// `metadata-video-title` → `video_title`, etc. videoChange clears all video_*
// fields, so the next view needs them again.
function videoData(player: FastPixPlayerElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const { name, value } of Array.from(player.attributes)) {
    if (name.startsWith("metadata-video-")) {
      data[name.slice("metadata-".length).replaceAll("-", "_")] = value;
    }
  }
  data.video_stream_type = player.getAttribute("stream-type") ?? "on-demand";
  return data;
}

export function endView(player: FastPixPlayerElement | null | undefined) {
  const metrix = (globalThis as { fastpixMetrix?: Metrix }).fastpixMetrix;
  // The SDK registers each tracker under the <video>'s `uniqueId`; passing the
  // element itself would look it up under a different id and miss.
  const key = (player?.video as { uniqueId?: string } | undefined)?.uniqueId;
  if (!metrix || !key || !player) return;
  // No-op for players without a workspace key (no tracker registered).
  metrix.dispatch(key, "videoChange", videoData(player));
}
