# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0]

### Added
- Instant startup: the first short plays in ~0.5 s on a cold load and ~0.1 s on refresh.
  - Build-time playlist snapshot (`vite-plugins/fastpix-startup.ts`) served to hls.js from memory by a custom playlist loader (`src/shorts/startup.ts`).
  - `<link rel="preload">` for the first short's poster and first segments, plus an early hls.js load and preconnects in `index.html`.
  - Service worker (`public/sw.js`) that keeps playlists stable so refreshes play from cache.
  - First-frame poster shown until playback starts, with the player's spinner hidden until then.
- Explore tab: grid of muted, looping previews (lowest rendition, on-screen tiles only) with a per-tile sound toggle.
- Playlists tab: playlists with an episode grid (Ep 1, Ep 2, ...) and a player scoped to the playlist's episodes.
- Hash routes for the feed, Explore, Playlists, playlist and episode pages, with history-aware back buttons.
- Resume: refresh or return visit reopens the last short (from its start), via the URL and `localStorage`.
- FastPix Data analytics, opt-in with `VITE_FASTPIX_WORKSPACE_KEY` (see `.env.example`); playlist episodes send `metadata-video-series`.
- Startup timing logs (`[perf] +<ms> ...`) for each playback milestone.
- Thumbnail fallback that shows a frame from the stream when FastPix has no thumbnail for an asset.

### Changed
- One FastPix Data view per short watched: off-screen shorts no longer start views, and swiping away ends the current view.
- Sound carries from Explore into the feed, and opening a playlist episode starts with sound; muted playback is used if the browser blocks sound.
- Neighbouring shorts mount only after the visible short starts playing, and buffer at most ~4 s while off-screen.
- Feed data moved to `src/shorts/feed.ts` (still re-exported from `src/shorts/types.ts`).
- README rewritten for the new features, with sections on startup, routes, sound rules, analytics and known issues.

### Fixed
- Active short occasionally paused at 0 s on load (race with the player's `autoplay-shorts` toggle).
- Short with multiple audio tracks stalled when its segments loaded from cache (startup audio-track switch).
- Off-screen neighbours played in the background.
- App overlays (subtitles, creator info, action buttons) covered the seek-preview thumbnail.
- `package-lock.json` version was out of sync with `package.json`.

## [1.1.0]

### Added
- Audio track switching: viewers can select from the available audio tracks for a short.
- Subtitle / caption track switching, including an "Off" option to disable subtitles.

### Fixed
- "Off" button in the subtitle menu now correctly turns captions off.

### Changed
- Upgraded `@fastpix/fp-player` to `^1.0.20`.
- Updated `src/App.tsx`, `src/shorts/ShortItem.tsx`, and `src/shorts/types.ts` to support the new track-switching UI.
- Refreshed README with audio/subtitle switching documentation.

## [1.0.0]

### Added
- Initial React 19 + Vite shorts-style demo app using `@fastpix/fp-player` (1.0.12).
- Vertical (9:16) shorts feed driven by a `SHORTS_FEED` JSON array in `src/shorts/types.ts`.
- FastPix web player integration for HLS playback via FastPix playback IDs.
