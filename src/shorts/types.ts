// Feed data lives in feed.ts (no DOM types) so vite.config.ts can import it.
export { SHORTS_FEED, PLAYLISTS, type ShortMeta, type Playlist } from "./feed";

export type TrackInfo = {
  id: number;
  label: string;
  language?: string;
  isDefault: boolean;
  isCurrent: boolean;
};

export interface FastPixPlayerElement extends HTMLElement {
  video?: HTMLVideoElement;
  play?: () => Promise<void> | void;
  pause?: () => void;
  mute?: () => void;
  unmute?: () => void;
  setSubtitleTrack?: (track: string | number | null) => void;
  setAudioTrack?: (label: string) => void;
  disableAllSubtitles?: () => void;
  getAudioTracks?: () => TrackInfo[];
  getSubtitleTracks?: () => TrackInfo[];
  destroy?: () => void;
  // hls.js config the player passes to `new Hls()` when it connects, and the
  // resulting instance. Both are internal to the player but publicly readable.
  config?: Record<string, unknown>;
  // Player's playlist-URL → HTTP status cache; a hit skips its validation fetch.
  cache?: Map<string, number>;
  hls?: {
    bandwidthEstimate?: number;
    config?: { maxBufferLength?: number };
  } | null;
}

// Detail payloads emitted by the FastPix player custom events.
export type SubtitleCueDetail = {
  text?: string;
  language?: string;
  startTime?: number;
  endTime?: number;
};

export type TracksReadyDetail = {
  audioTracks?: TrackInfo[];
  subtitleTracks?: TrackInfo[];
};

export type TrackChangeDetail = {
  tracks?: TrackInfo[];
  currentTrack?: TrackInfo | null;
};

// Vendor-prefixed fullscreen APIs are not in the standard lib DOM typings.
export type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

export type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};
