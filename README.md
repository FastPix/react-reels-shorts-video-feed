# Build a shorts video feed in React 19 with the FastPix player

[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![FastPix player](https://img.shields.io/badge/FastPix-web%20player-0E7C66)](https://fastpix.com/)

A working reference implementation - a cookbook, not a black box - for building a vertical, full-screen **shorts video feed** (Reels / TikTok-style) in **React 19 + Vite** on top of the web-based **FastPix player** (`<fastpix-player>`). It shows scroll-snapping between videos, autoplay of the active short, per-short and feed-level mute, a custom seekbar and controls, audio/subtitle track switching, and windowed rendering for performance - while FastPix handles HLS (.m3u8) streaming under the hood.

On top of the feed it adds the pieces a real shorts app needs: **near-instant startup** (first frame in ~0.5 s on a cold load, ~0.1 s on refresh), an **Explore** grid of muted autoplaying previews, **Playlists** with episodes, **resume where you left off**, and **FastPix Data** analytics with one view per swipe.

**Works with:** React 19 · Vite · TypeScript · FastPix web player (`<fastpix-player>`) · HLS (.m3u8) · vertical 9:16 shorts

📖 **FastPix docs:** https://fastpix.com/docs/web-player/build-a-shorts-feed-with-react &nbsp;·&nbsp; 🚀 **Free account + playback IDs:** https://dashboard.fastpix.com

This `react-shorts-app` project is a **shorts-style demo** that shows how to use the web-based FastPix player in a React 19 app.

**Player bundle:** `src/App.tsx` imports the player from npm (`import "@fastpix/fp-player"`, `^1.0.20`). The player loads **hls.js** from jsDelivr at runtime; `index.html` preloads the same script (pinned to `hls.js@1.7.3`) so it downloads in parallel with the app.

<br />

## What this demo shows

- Vertical, full-screen **scroll-snapping** feed (wheel, touch, and keyboard).
- **Autoplay** the active short while pausing and muting the rest.
- Feed-level **mute / unmute** with autoplay-policy handling.
- A **custom seekbar** and custom controls layered on the FastPix player.
- **Audio and subtitle/caption track switching**, plus custom caption rendering.
- **Windowed rendering** (only mount nearby shorts) for performance.
- Fullscreen, like / follow / share, and creator UI - all owned by React.
- Reading the underlying `HTMLVideoElement` while FastPix owns streaming.
- **Instant startup:** build-time playlist snapshot, preloaded first segments, a first-frame poster, and a service-worker cache so refreshes start from cache. See [Instant startup](#instant-startup).
- **Explore tab:** a grid of muted, looping previews with a per-tile sound toggle. See [Explore, Playlists and routes](#explore-playlists-and-routes).
- **Playlists tab:** playlists with an episode grid (Ep 1, Ep 2, ...); opening an episode plays a feed scoped to that playlist.
- **Resume:** a refresh or return visit reopens the short you were on, from its start.
- **FastPix Data:** opt-in video analytics with one view per short actually watched. See [FastPix Data (video analytics)](#fastpix-data-video-analytics).

<br />

## Prerequisites

To run or adapt this demo you should have:

- **Node.js** 18+ and **npm** 9+ installed.
- A React app (this example uses **React 19 + Vite**).
- Access to **FastPix vertical videos (9:16)** with:
  - A FastPix **playback ID** for each short.
  - Assets encoded for vertical viewing – this demo assumes a portrait/shorts layout only.

<br />

### Feed JSON format (universal)

The shorts feed is just a JSON array. You can generate or fetch it from your own backend as long as it matches this shape:

```json
[
  {
    "id": "YOUR_PLAYBACK_ID_1",
    "creator": "channel_or_creator_handle",
    "title": "Title for the short",
    "likes": "12.4K",
    "comments": "342",
    "shares": "891"
  },
  {
    "id": "YOUR_PLAYBACK_ID_2",
    "creator": "another_creator",
    "title": "Another vertical short",
    "likes": "8.7K",
    "comments": "201",
    "shares": "543"
  }
]
```

In this repo, that JSON is represented by the TypeScript array `SHORTS_FEED` in `src/shorts/feed.ts` (re-exported from `src/shorts/types.ts`).  
**Replace every `id` with your own FastPix playback IDs** and update `creator`, `title`, and counts as needed. The code does not depend on any other fields, so this format is **universal** across apps and backends as long as you keep these keys.

All playback in the demo ultimately comes from `short.id` being passed to:

```tsx
<ShortItem playbackId={short.id} metadata={short} ... />
```

So once you wire your own JSON feed into `SHORTS_FEED` (or fetch it and pass it as props), the shorts player will work with your vertical videos.

<br />

## Quick start

Clone the repo and run the demo locally:

```bash
git clone https://github.com/FastPix/fastpix-web-player-react-shorts-demo.git
cd fastpix-web-player-react-shorts-demo

npm install
npm run dev
```

Then open the URL Vite prints (by default `http://localhost:5173`).

Before you start, update `src/shorts/feed.ts`: replace the playback IDs, creators and titles in `SHORTS_FEED` with your own FastPix assets, and replace the demo playlist in `PLAYLISTS` (it reuses the feed's videos as episodes).

To enable FastPix Data analytics (optional), copy `.env.example` to `.env.local` and set your workspace key:

```bash
VITE_FASTPIX_WORKSPACE_KEY=your-workspace-key
```

To build and preview a production bundle:

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc -b` and `vite build`, producing a static build in `dist/`. **Measure startup with the production build** - in `npm run dev`, React's `StrictMode` mounts every player twice.

> The build fetches each short's playlists from FastPix (see [Instant startup](#instant-startup)), so it needs network access. If FastPix can't be reached, the build still succeeds and the app falls back to normal network loading.

<br />

## Project structure

```
index.html                       hls.js preload, preconnects, black page shell
public/sw.js                     service worker: caches playlists, first segments, posters
vite-plugins/fastpix-startup.ts  build-time playlist snapshot + <link rel="preload"> injection
src/
  main.tsx                       registers the service worker, renders <Root />
  Root.tsx                       hash router: feed / explore / playlists / playlist / episode
  App.tsx                        ShortsApp: the vertical player (main feed or one playlist)
  shorts/
    feed.ts                      SHORTS_FEED and PLAYLISTS data
    ShortItem.tsx                one short: <fastpix-player> + overlays
    startup.ts                   hls.js playlist loader serving snapshot/prefetched playlists
    analytics.ts                 ends a FastPix Data view when the user swipes away
    soundPreference.ts           carries "sound on" from Explore/Playlists into the feed
    FeedTabs.tsx, hls.ts, utils.ts, types.ts
  explore/
    ExplorePage.tsx              muted autoplay preview grid
    PlaylistsPage.tsx            Playlists tab
    PlaylistPage.tsx             episode grid for one playlist
    PlaylistTile.tsx, Thumbnail.tsx, TabsHeader.tsx, routes.ts, layout.ts
```

It focuses on **programmatic control** of the player and a **shorts feed UI**:

- Each short uses a `<fastpix-player>` web component.
- React drives **which short is active**, **mute state**, **scroll snapping**, and **UI controls**.
- The player instance exposes convenience methods (`play`, `pause`, `mute`, `unmute`) and an underlying `HTMLVideoElement` via `playerRef.current.video`.

<br />

## What FastPix handles vs what this app handles

At a high level:

- **FastPix (player level)** – implemented in `@fastpix/fp-player` and configured via **attributes + CSS variables**:
  - HLS (m3u8) playback, manifest fetching, buffering, error handling.
  - Track selection (audio, captions), DRM, thumbnails, ads/shoppable integrations.
  - **Attributes we set in code**:
    - `playback-id` – which vertical asset to play (1:1 with your feed JSON `id`).
    - `autoplay-shorts` – tuned autoplay behavior for shorts for instant playback start.
    - `muted` and `loop` – initial mute + continuous looping at the player level.
    - `disable-keyboard-controls` – let the app (not the player) own keyboard shortcuts.
    - `preload` – per‑item preload hint (`"auto"`, `"metadata"`, `"none"`).
  - **CSS variables we use in `index.css`**:
    - Hide built‑in overlays (middle controls, bottom‑right cluster, left controls) so we can draw our own UI:
      - **Middle controls** – `--middle-controls-mobile`, `--play-button-initialized`, `--mobile-play-button-initialized`.
      - **Bottom‑right controls** – `--bottom-right-controls`, `--bottom-right-controls-mobile`.
      - **Left‑bottom controls** – `--left-controls-bottom`, `--left-controls-bottom-mobile`.
    - `--seekbar-bottom` – pins the FastPix seekbar to the very bottom of the frame; the thumbnail sprites and timestamp tiles automatically follow this position.
    - `--progress-bar-invisible: 1` – makes the **visual bar** invisible but keeps the **FastPix seekbar logic fully active**, so:
      - Hover thumbnail previews and timestamp pills **still work**.
      - Click‑to‑seek on the underlying bar still works.
      - We can build our own progress stripe on top, driven by `video.currentTime`, while reusing all of FastPix’s seeking behavior under the hood.
  - Internal seekbar behavior, thumbnail seeking, and all low‑level media work remain the player’s responsibility.

- **This React app (application level)** – implemented in `src/App.tsx` + `src/shorts`:
  - Maintains the **shorts feed** (`SHORTS_FEED`) and renders one `ShortItem` per entry.
  - Tracks **which short is active** (`activeIndexRef`), **global mute state** (`isMuted`), and whether the user has interacted (for autoplay policy).
  - Uses refs to **call player methods** (`play()`, `pause()`, `mute()`, `unmute()`) at the right time:
    - Autoplay the active short when scroll/snapping lands on it.
    - Pause + mute all non‑active shorts so only one plays at a time.
  - Owns **all visible UI and layout**:
    - Play/pause, mute/unmute, fullscreen buttons.
    - Like/follow/share buttons, creator chip, HUD counter, vertical dot rail.
    - Custom progress stripe that mirrors `video.currentTime` but delegates seek + thumbnails to FastPix.
  - Controls **navigation and feed UX**:
    - Scroll snapping (wheel + touch) between shorts.
    - Keyboard navigation (ArrowUp / ArrowDown) via app‑level handlers.
    - Fullscreen of the **scroll container** so the shorts column behaves the same in fullscreen and windowed modes.

Use this repo as a **working reference implementation**: you can copy the patterns from:

- `src/App.tsx` – feed container, refs, and behavior (`playAt`, `handleMuteToggle`, wheel/keyboard handlers).  
- `src/shorts/ShortItem.tsx` – per‑card player mounting and card UI.  
- `src/shorts/feed.ts` – universal JSON format for your shorts feed (and playlists).  
- `src/index.css` – how to hide built‑in controls and restyle the player for a shorts layout.

You are encouraged to re‑use or adapt this code in your own GitHub projects.

<br />

## Accessing the underlying `video` element

FastPix exposes the native `HTMLVideoElement` on the custom element as a `video` property. In this demo we type it as:

```ts
interface FastPixPlayerElement extends HTMLElement {
  video?: HTMLVideoElement;
  play?: () => Promise<void> | void;
  pause?: () => void;
  mute?: () => void;
  unmute?: () => void;
  destroy?: () => void;
}
```

Inside `ShortItem` we keep a ref to the player:

```ts
const playerRef = useRef<FastPixPlayerElement | null>(null);
```

Once the element is created and mounted, we can safely access the `video` element:

```ts
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
```

We also use `playerRef.current.video` for:

- **Progress bar**: a `requestAnimationFrame` loop reads `video.currentTime` / `video.duration`.
- **Preload behavior**: setting `video.preload` based on whether the short is active / adjacent.

This keeps **visual progress and preloading** under app control while the streaming logic stays in FastPix.

<br />

## Audio & subtitle tracks (this demo)

The shorts demo wires **multi-track audio** and **subtitle / caption** switching on top of the FastPix web component. It uses the same ideas as the standalone HTML demo and the project’s `AUDIO_SUBTITLE_TRACKS_API.md` (methods, events, attributes).

<br />

### Player attributes used in `ShortItem.tsx`

| Attribute | Purpose |
|-----------|--------|
| **`hide-native-subtitles`** | Keeps the player’s **internal** `subtitleContainer` from showing text. **`fastpixsubtitlecue` still fires** so your React overlay can render captions. Use this when you want **only** your custom subtitle UI. |
| **`disable-hidden-captions`** *(optional)* | On load, subtitles start **Off** (no automatic showing). After that, the user or your code can enable a track via the built-in CC menu or `setSubtitleTrack(...)`. |
| **`default-audio-track`** *(optional)* | Initial audio track by **label** (case-insensitive), e.g. `"French"`. Must match a track name from the HLS manifest. |
| **`default-subtitle-track`** *(optional)* | Initial subtitle track by **label** (case-insensitive). Only applies when subtitles are allowed to show (not when you force everything Off with `disable-hidden-captions` on load). |

Example (conceptual — in this repo the element is created in `useEffect`; attributes are the same as JSX):

```ts
el.setAttribute("playback-id", playbackId);
el.setAttribute("autoplay-shorts", "");
if (isMuted) el.setAttribute("muted", ""); // unmuted when the viewer already turned sound on
el.setAttribute("loop", "");
el.setAttribute("disable-keyboard-controls", "");
el.setAttribute("preload", preload);
el.setAttribute("hide-native-subtitles", "");
// Optional:
// el.setAttribute("disable-hidden-captions", "");
// el.setAttribute("default-audio-track", "French");
// el.setAttribute("default-subtitle-track", "English");
```

<br />

### Programmatic API (on the custom element)

After the manifest / text tracks are ready, you can call:

| Method | Description |
|--------|-------------|
| `getAudioTracks()` | Snapshot of audio `TrackInfo[]` (de-duped by label). |
| `setAudioTrack(label)` | Switch audio by **label** (string only; not numeric id). |
| `getSubtitleTracks()` | Snapshot of subtitle/caption tracks. |
| `setSubtitleTrack(label \| null)` | Enable a track by **label**, or `null` for **Off**. |
| `disableSubtitles()` | Same idea as choosing **Off** in the built-in menu (when available). |

`TrackInfo` objects include `id`, `label`, optional `language`, `isDefault`, `isCurrent`. Prefer **`label`** for `setAudioTrack` / `setSubtitleTrack`; use **`language`** for persisting user preference across assets.

<br />

### Events

| Event | When | Typical use |
|-------|------|-------------|
| **`fastpixtracksready`** | After HLS manifest is parsed; may fire again when subtitle `textTracks` attach. | Populate menus; read `event.detail.audioTracks` / `subtitleTracks`. |
| **`fastpixaudiochange`** | User or `setAudioTrack` changed audio. | Refresh UI highlight. |
| **`fastpixsubtitlechange`** | User or `setSubtitleTrack` / Off changed subtitles. | Refresh UI highlight. |
| **`fastpixsubtitlecue`** | Active cue text updates. | Drive a **custom** React subtitle overlay (recommended with `hide-native-subtitles`). |

**Active short only:** In this demo, `fastpixsubtitlecue` is listened to only when `isActive === true` (see below), so the console and React state are not flooded by off-screen shorts.

<br />

### UI in this repo: three-dots menu + overlay

- **Top bar (⋯)** – Shown only when the stream exposes **more than one audio** track and/or **at least one** subtitle track. The menu lists **Audio** and **Subtitles** (with an **Off** row for captions) and calls `setAudioTrack` / `setSubtitleTrack`.
- **Custom subtitle pill** – Subscribes to `fastpixsubtitlecue`, updates local state, and renders a centered pill above the progress bar. With `hide-native-subtitles`, that pill is the visible captions layer.

`App.tsx` passes **`isActive={i === activeIndex}`** into each `ShortItem` so subtitle cue handling and logging apply only to the visible short.

<br />

### Working minimal pattern (React + ref to `fastpix-player`)

```ts
useEffect(() => {
  const player = playerRef.current as any;
  if (!player || !isActive) return;

  const onCue = (e: Event) => {
    const d = (e as CustomEvent).detail || {};
    console.log("[fastpixsubtitlecue]", d);
    setSubtitleText(d.text ?? "");
  };

  player.addEventListener("fastpixsubtitlecue", onCue);
  return () => player.removeEventListener("fastpixsubtitlecue", onCue);
}, [playbackId, isActive]);
```

Full project reference: **`AUDIO_SUBTITLE_TRACKS_API.md`** at the web-player repo root.

<br />

## Feed performance (windowed shorts + stable `playAt`)

To avoid mounting every short’s `<fastpix-player>` at once:

- **`App.tsx`** renders only a **window** of items around `activeIndex` (current ±2), each wrapped in an **absolutely positioned** slot at `top: i * 100vh` so scroll position still matches index `i`. On startup the window is just the visible short; neighbours mount once it is playing (or after a 4 s fallback), because every mounted player starts downloading segments.
- **`preload`** stays strict: `"auto"` for the active short, `"metadata"` for neighbors, `"none"` for others in the window.
- **`playAt`** skips re-running play logic for the **same** index repeatedly (dedupe with `lastPlayIndexRef`) so you do not get play/pause flicker when scroll handlers fire multiple times.

**Startup logs:** every milestone is logged as `[perf] +<ms> ...` (ms since navigation start, so it lines up with the Network panel): app evaluated, player created, `loadstart` → `loadedmetadata` → `loadeddata` (first frame) → `playing`, plus `waiting` / `stalled` / `error`. Filter the console by `[perf]`, and measure with `npm run build && npm run preview`.

<br />

## Player methods: `play`, `pause`, `mute`, `unmute`

At the application level we treat each FastPix instance as a small API surface:

```ts
// In ShortsApp (App.tsx)
const playerRefsByIndex = useRef<Record<number, FastPixPlayerElement | null>>({});

const registerPlayer = useCallback((index: number, player: FastPixPlayerElement | null) => {
  if (player) playerRefsByIndex.current[index] = player;
  else delete playerRefsByIndex.current[index];
}, []);
```

`ShortItem` calls `registerPlayer(itemIndex, el)` when it mounts / unmounts.

<br />

### Centralized playback control (`playAt`)

Simplified for readability. The full version in `App.tsx` also ends the previous short's FastPix Data view and works around the `autoplay-shorts` startup toggle (see [Known issues and workarounds](#known-issues-and-workarounds)).

```ts
const playAt = useCallback(
  (index: number, options: { resetTime?: boolean } = {}) => {
    const { resetTime = true } = options;

    // Pause + mute all other players
    Object.entries(playerRefsByIndex.current).forEach(([i, p]) => {
      const playerEl = p;
      if (!playerEl) return;
      if (Number(i) !== index) {
        playerEl.mute?.();
        playerEl.pause?.();
      }
    });

    const player = playerRefsByIndex.current[index];
    if (!player) return;

    // Optionally reset time when snapping to a new short
    if (resetTime && player.video) player.video.currentTime = 0;

    // Autoplay policy: before any gesture, always muted; after interaction, honor app mute state
    if (!hasUserInteractedRef.current) {
      player.mute?.();
    } else {
      isMutedRef.current ? player.mute?.() : player.unmute?.();
    }

    const playResult = player.play?.();
    if ((playResult as Promise<void> | undefined)?.catch) {
      (playResult as Promise<void>).catch(() => {
        requestAnimationFrame(() => {
          if (activeIndexRef.current === index) {
            player.play?.()?.catch?.(() => {});
          }
        });
      });
    }
  },
  [],
);
```

**What FastPix handles:**

- HLS (m3u8) streaming, manifests, network logic.
- Thumbnails, captions, audio tracks, quality selection.
- Keyboard shortcuts (when not disabled), volume persistence, ads/shoppable integrations, etc.

**What the app handles:**

- Which short is active (`activeIndexRef` + scroll listener / wheel / keyboard).
- Global mute state and user interaction tracking.
- When to call `play()`, `pause()`, `mute()`, `unmute()` across the playlist.
- UI layer: creator chip, subscribe, like/share/follow, HUD counters, scroll arrows.

This separation keeps **streaming and player internals** inside FastPix while React orchestrates **feed behavior and UX**.

<br />

## Instant startup

A cold load used to take 1.5–2.5 s to the first frame: the player downloads hls.js only after the app runs, the first playlist request to `stream.fastpix.com` takes 0.7–1 s, hls.js test-downloads a 270p segment before fetching a ~2 MB 1080p one, and neighbouring players compete for bandwidth. Everything below is app-side - no backend changes.

| Technique | Where | Effect |
|---|---|---|
| Preload hls.js (with the `data-fp-hls-loader` attribute the player looks for) + preconnect to FastPix hosts | `index.html` | hls.js downloads in parallel with the app instead of after it |
| Build-time playlist snapshot: master playlists for every short, plus 480p video and audio playlists for the first one | `vite-plugins/fastpix-startup.ts` | No cold playlist request on first visit; a custom hls.js `pLoader` serves them from memory (`src/shorts/startup.ts`) |
| `<link rel="preload">` for the first short's poster, init segments and first media segments | injected into `index.html` at build | First segment downloads ~30 ms after navigation, alongside the JS |
| Start at a known level (`startLevel`) / skip hls.js's bandwidth test (`testBandwidth: false`) | `ShortItem.tsx` | One ~825 KB 480p segment before the first frame instead of 270p test + 2 MB 1080p |
| Skip the player's duplicate validation request (pre-fill `el.cache`) | `startup.ts` | One playlist request instead of two |
| Mount only the visible short until it plays; neighbours buffer ≤ 4 s | `App.tsx`, `ShortItem.tsx` | The visible short gets the bandwidth |
| First-frame poster (`thumbnail.webp?time=0`) shown until frames play; the player's spinner is hidden until then | `ShortItem.tsx` | Something real is on screen in ~0.1 s, with no black frame or spinner |
| Service worker reuses a playlist while its signed URLs are valid | `public/sw.js` | Segment URLs stay stable, so a refresh plays from cache in ~50–180 ms |

Measured with the production build in Chromium: first visit **~0.4–0.8 s** to playing on a fast connection (**~1.3–1.6 s** at 10 Mbps), refresh **~0.05–0.25 s**.

**Things to know**

- **Rebuild at least monthly.** FastPix playlists are signed for ~30 days. Expired snapshot entries are ignored at runtime (the app falls back to the network), so an old build still works, just slower. A scheduled rebuild keeps it fast.
- **The feed must be known at build time** for the snapshot. A feed fetched from an API still works; it just doesn't get the snapshot head start.
- **Shared signed URLs.** Every viewer of a build uses the same signed playlist and segment URLs. FastPix Data views are unaffected (each view gets its own ID).
- To favour slow connections, lower `START_SHORT_SIDE` in the plugin from 480 to 270 (≈330 KB first segment, lower quality for the first 4 s).

<br />

## Explore, Playlists and routes

Routing is hash-based (`src/explore/routes.ts`, `src/Root.tsx`):

| Hash | Page |
|---|---|
| `#short/<playbackId>` (or none) | For You feed, opened on that short (or the last one watched) |
| `#explore` | Explore grid |
| `#playlists` | Playlists tab |
| `#playlist/<playlistId>` | Episode grid for one playlist |
| `#playlist/<playlistId>/ep/<playbackId>` | Player scoped to that playlist, opened on that episode |

**Explore tab** - every short as a 9:16 tile that autoplays **muted** and loops while on screen (off-screen tiles pause). Tiles are plain `<video>` elements driven by hls.js and pinned to the lowest rendition (270p), not full FastPix players, so a grid stays cheap and previews don't count as FastPix Data views. Each tile has a **sound toggle**: it unmutes that tile in place, and only one tile has sound at a time. Tapping anywhere else on a tile opens it in the For You feed.

**Playlists tab** - each playlist shows its first episode's thumbnail with a playlist badge and episode count. Tapping it opens an episode grid (`Ep 1`, `Ep 2`, ... with titles and thumbnails). Tapping an episode opens the same vertical player, but **scoped to that playlist**: swiping, the mouse wheel, arrow keys and the ↑/↓ buttons move between its episodes only and stop at the first and last. The header shows a back button, the playlist title and `Ep n / total`. Define playlists in `PLAYLISTS` (`src/shorts/feed.ts`):

```ts
export const PLAYLISTS: Playlist[] = [
  {
    id: "my-series-s1",
    title: "My Series · Season 1",
    creator: "creator_handle",
    episodes: [
      { id: "PLAYBACK_ID_EP1", creator: "creator_handle", title: "Pilot", likes: "1.2K", comments: "40", shares: "12", episode: 1, series: "My Series · Season 1" },
      // ...
    ],
  },
];
```

**Thumbnails** - grid cards use FastPix's default thumbnail (a representative frame; the first frame is often black). If FastPix has no thumbnail for an asset, `Thumbnail.tsx` shows a real frame from the stream instead.

**Back navigation** - in-app back buttons use `history.back()` when you navigated there inside the app, and replace the entry when you landed on a deep link, so the browser's back button always agrees with them.

<br />

## Sound and resume behavior

- **First load** starts muted (browser autoplay policy). The mute button unmutes, and the choice persists across swipes.
- **From Explore:** if any preview had sound on when you tap a tile, the feed starts **unmuted**.
- **From a playlist:** tapping an episode always starts **with sound** - it's an explicit "watch this".
- **Fallback:** if a browser still refuses playback with sound (e.g. iOS Safari), the feed switches to muted and keeps playing rather than stalling.
- **Resume:** the current short is kept in the URL (`#short/<id>` or the episode URL) and in `localStorage`, so a refresh or return visit reopens it **from its start**. Swiping back to a short also restarts it.

<br />

## FastPix Data (video analytics)

Analytics are off unless you set a workspace key:

```bash
# .env.local (git-ignored)
VITE_FASTPIX_WORKSPACE_KEY=your-workspace-key
```

When it is set, `ShortItem.tsx` adds these attributes **before** the player is attached (the player reads them once, on connect): `metadata-workspace-key`, `metadata-video-id`, `metadata-video-title`, `metadata-video-producer` (creator), `metadata-player-name`, and `metadata-video-series` for playlist episodes. The key is read at build time, so rebuild after changing it, and set the variable in your hosting provider's build environment too.

Two app-side details make the numbers match what viewers actually watched:

1. **No views for off-screen shorts.** Every player has `autoplay-shorts`, and the Data SDK starts a view on the first `play` event, so neighbours used to log views nobody saw. `App.tsx` blocks `play()` on any player that isn't the active one.
2. **One view per swipe.** The SDK only closes a view on page unload or player destroy, but swiped-past shorts stay mounted. `src/shorts/analytics.ts` sends a `videoChange` event when the viewer swipes away, which completes that view; coming back starts a new one.

Add `enable-debug` to the player temporarily to inspect what is sent.

<br />

## Known issues and workarounds

These are handled in the app; they're documented here because you'll hit them in any `autoplay-shorts` integration.

- **Startup pause race.** With `autoplay-shorts`, the player toggles play/pause once on the video's first `canplay`. If your code already called `play()`, that toggle pauses the video at 0 s. `playWithRetry` in `App.tsx` waits for `canplay` and only starts playback if the video is still paused afterwards.
- **Audio-track switch stall.** The player switches to the audio track named "default" right after the manifest loads. When responses are instant (cache), that switch aborts in-flight loads and the buffer never fills. Setting hls.js `audioPreference: { name: "default" }` starts on the same track, so no switch happens.
- **Seek-preview tile.** The thumbnail preview lives in the player's shadow DOM, below any overlay you add. `ShortItem.tsx` watches for it and fades its overlays out while it shows.
- **Native HLS in recent Chrome.** Chrome can now play HLS natively and picks its own (high) rendition. Preview tiles always use hls.js when supported so they can be pinned to the lowest level.
- **Missing assets.** Some assets have no thumbnail or `spritesheet.json` on `images.fastpix.com` (404); thumbnails fall back to a stream frame, and the seek preview is unavailable for those assets.

<br />

## Hiding built‑in controls and using a custom seekbar

The demo hides most of the built‑in FastPix UI and renders its own Shorts-style overlays and seekbar, while still letting the **FastPix logic handle hover thumbnails and seek behavior**.

In `src/index.css`:

```css
fastpix-player {
  --middle-controls-mobile: none;
  --mobile-play-button-initialized: none;
  --bottom-right-controls-mobile: none;
  --bottom-right-controls: none;
  --left-controls-bottom: none;
  --left-controls-bottom-mobile: none;
  --seekbar-bottom: 0px;
  /* Hide progress bar visually but keep it for hover/seek so timestamp preview works */
  --progress-bar-invisible: 1;
  --play-button-initialized: none;
}
```

<br />

### Why we hide the built‑in controls

- **Shorts-style UX** – We want the player frame to look like a shorts reel:
  - Custom top bar (play/pause, mute/unmute, fullscreen).
  - Custom right rail (scroll arrows, like/share/follow).
  - Custom bottom progress stripe that matches the card’s rounded corners.
- **Branding & layout control** – App code controls spacing, border radius, and overlays consistently across the feed.

By setting the FastPix CSS variables to `none`, we **hide**:

- Middle play/pause controls.  
- Mobile overlay play buttons.  
- Bottom-right control clusters (volume, settings, etc.).  
- Left-bottom overlays.

But we **do not disable** the underlying logic – only the visuals.

<br />

### Custom seekbar powered by FastPix

In `ShortItem.tsx`, the progress bar you see at the bottom of each card is **fully app‑driven**, using the FastPix video element:

```tsx
// Progress state
const [progress, setProgress] = useState(0);

useEffect(() => {
  const player = playerRef.current;
  const vid = player?.video;
  if (!vid) return;

  const paint = () => {
    const duration = vid.duration;
    if (duration > 0 && isFinite(duration)) {
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
    if (rafId == null) rafId = requestAnimationFrame(loop);
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

// Render
<div
  style={{
    position: "absolute",
    bottom: 0,
    left: 20,
    right: 20,
    height: 3,
    zIndex: 3,
    background: "rgba(255,255,255,0.2)",
    pointerEvents: "none",
    borderRadius: "0 0 16px 16px",
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
```

This bar is **read‑only** – it reflects FastPix’s playback state, but all **click‑to‑seek and thumbnail preview** responsibility stays inside the FastPix player.

Because we use:

- `--progress-bar-invisible: 1` – the built‑in progress bar is visually hidden, but:
  - Hover thumbnails, timestamp preview, and click‑to‑seek continue to work on the underlying FastPix bar.
- Our own progress stripe is layered **on top**, giving full visual control without re‑implementing seeking logic.

In other words:

- **FastPix** still handles:
  - Computing seek positions, updating internal range, showing thumbnails.
- **Your React app**:
  - Renders a custom progress bar synced to `video.currentTime`.
  - Owns the visual design of the seekbar, while leveraging FastPix’s tried-and-tested seeking behavior underneath.

<br />

## Example: wiring buttons to `play`, `pause`, `mute`, `unmute`

Below is a **minimal pattern** (derived from the real `App.tsx`) that shows how to wire UI buttons to FastPix methods.

### 1. Track players and active index

```ts
const [activeIndex, setActiveIndex] = useState(0);

const playerRefsByIndex = useRef<Record<number, FastPixPlayerElement | null>>({});
const activeIndexRef = useRef(0);
const isMutedRef = useRef(true);
const hasUserInteractedRef = useRef(false);

activeIndexRef.current = activeIndex;
isMutedRef.current = isMuted;

const registerPlayer = useCallback(
  (index: number, player: FastPixPlayerElement | null) => {
    if (player) playerRefsByIndex.current[index] = player;
    else delete playerRefsByIndex.current[index];
  },
  [],
);
```

`ShortItem` calls `registerPlayer(itemIndex, el)` when its `fastpix-player` mounts.

<br />

### 2. Central `playAt` and a mute toggle handler

```ts
const playAt = useCallback(
  (index: number, options: { resetTime?: boolean } = {}) => {
    const { resetTime = true } = options;

    // Pause + mute everyone else
    Object.entries(playerRefsByIndex.current).forEach(([i, p]) => {
      const playerEl = p;
      if (!playerEl) return;
      if (Number(i) !== index) {
        playerEl.mute?.();
        playerEl.pause?.();
      }
    });

    const player = playerRefsByIndex.current[index];
    if (!player) return;

    if (resetTime && player.video) {
      player.video.currentTime = 0;
    }

    // Autoplay policy vs user mute preference
    if (!hasUserInteractedRef.current) {
      player.mute?.();
    } else {
      isMutedRef.current ? player.mute?.() : player.unmute?.();
    }

    const playResult = player.play?.();
    if ((playResult as Promise<void> | undefined)?.catch) {
      (playResult as Promise<void>).catch(() => {
        requestAnimationFrame(() => {
          if (activeIndexRef.current === index) {
            player.play?.()?.catch?.(() => {});
          }
        });
      });
    }
  },
  [],
);

const handleMuteToggle = useCallback(() => {
  const player = playerRefsByIndex.current[activeIndexRef.current];
  if (!player) return;

  if (isMuted) {
    hasUserInteractedRef.current = true;
    player.unmute?.();
    setIsMuted(false);
  } else {
    player.mute?.();
    setIsMuted(true);
  }
}, [isMuted]);
```

<br />

### 3. Hooking up actual buttons

In the **ShortItem** overlay we use the underlying `video` element for play/pause:

```tsx
// Inside ShortItem.tsx
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    const vid = playerRef.current?.video;
    if (vid) vid.paused ? vid.play() : vid.pause();
  }}
  aria-label={isPlaying ? "Pause" : "Play"}
>
  {isPlaying ? "Pause" : "Play"}
</button>
```

In the **ShortsApp** container we wire a mute/unmute button to `handleMuteToggle`:

```tsx
// In the top HUD (App.tsx)
<button
  type="button"
  onClick={handleMuteToggle}
>
  {isMuted ? "Tap to unmute" : "Mute"}
</button>
```

You can also expose explicit **Play / Pause** buttons for the current short by using `playAt` and the active player:

```tsx
const handlePlayClick = () => {
  playAt(activeIndexRef.current, { resetTime: false });
};

const handlePauseClick = () => {
  const player = playerRefsByIndex.current[activeIndexRef.current];
  player?.pause?.();
};

// Example buttons:
<button type="button" onClick={handlePlayClick}>Play current</button>
<button type="button" onClick={handlePauseClick}>Pause current</button>
```

This is the exact pattern the demo uses: **central refs + helpers in `App.tsx`**, and **small buttons in the UI** that call `play()`, `pause()`, `mute()`, and `unmute()` on the right FastPix instance.

<br />

## Why `document.createElement("fastpix-player")` instead of JSX?

In `ShortItem` we mount the player like this:

```ts
useEffect(() => {
  const container = containerRef.current;
  if (!container || playerRef.current) return;

  const el = document.createElement("fastpix-player") as FastPixPlayerElement;
  el.setAttribute("playback-id", playbackId);
  el.setAttribute("autoplay-shorts", "");
  el.setAttribute("muted", "");
  el.setAttribute("loop", "");
  el.setAttribute("disable-keyboard-controls", "");
  el.setAttribute("preload", preload);
  el.setAttribute("hide-native-subtitles", "");
  // Optional: el.setAttribute("disable-hidden-captions", "");
  // Optional: el.setAttribute("default-audio-track", "French");
  // Optional: el.setAttribute("default-subtitle-track", "English");
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.objectFit = "cover";
  container.appendChild(el);
  playerRef.current = el;
  registerPlayer(itemIndex, el);

  return () => {
    registerPlayer(itemIndex, null);
    try { if (typeof el.destroy === "function") el.destroy(); } catch {}
    if (container.contains(el)) container.removeChild(el);
    playerRef.current = null;
  };
}, [playbackId, itemIndex, registerPlayer]);
```

Instead of:

```tsx
// We intentionally DO NOT do this today:
// <fastpix-player playback-id={...} autoplay-shorts muted loop />
```

<br />

### Reasons (React 19 + current web component)

- **Lifecycle control for a shorts feed**  
  With programmatic `document.createElement`, we have full control over **when a player is created and destroyed**. In a shorts UX this is important to:
  - Avoid keeping too many `<fastpix-player>` instances alive at once.
  - Explicitly clean up (calling `destroy()` if available) when a card unmounts.

- **Attribute-only API today**  
  The current web player is designed as a **framework-agnostic custom element**:
  - All configuration is via attributes (`playback-id`, `autoplay-shorts`, `muted`, `loop`, etc.).
  - React 19 can render it as JSX, but:
    - Attribute updates and ref timing can be trickier in complex virtualized lists.
    - We want deterministic mounting/teardown tied to our `useEffect`, especially for autoplay + shorts snapping behavior.

- **Interop safety while React-based version is in progress**  
  We’re actively working on a **React-based version** of the FastPix player, which will expose a first-class `<FastPixPlayer />` component with idiomatic props, hooks, and React 19 semantics.

  Until that is released, using `document.createElement("fastpix-player")`:

  - Keeps the integration **explicit and predictable**.
  - Avoids subtle issues around how React reconciles custom elements across rapid feed changes.
  - Matches what you would do in any non-React environment (plain JS, Next.js with custom layout effects, etc.).

When the React-native wrapper is available, this demo can be simplified to:

```tsx
<FastPixPlayer
  playbackId={short.id}
  autoplayShorts
  muted
  loop
  disableKeyboardControls
  onReady={(player) => registerPlayer(itemIndex, player)}
/>;
```

For now, this example is a **reference implementation** for using the **web component version** of FastPix in a React 19 shorts experience. It shows:

- How to **control the player via refs and methods**.
- How to **read the underlying `video` element** when needed.
- How to **switch audio and subtitle tracks** (`getAudioTracks`, `setSubtitleTrack`, `fastpixsubtitlecue`, etc.) — see **Audio & subtitle tracks** above.
- How to **keep feed-level logic inside React** while delegating playback to FastPix.

<br />

## Custom buttons, fullscreen, and likes – how the UI works

This demo deliberately **replaces most of the built‑in player chrome** with React components so you can see how to wire your own UI on top of FastPix.

At a high level:

- **Play / Pause** (per short)  
  - Implemented in `ShortItem.tsx` by reading the underlying `video` element:

    ```tsx
    const vid = playerRef.current?.video;
    if (vid) vid.paused ? vid.play() : vid.pause();
    ```

  - We also mirror that state into `isPlaying` (via `play`/`pause` listeners) to render the right icon.

- **Mute / Unmute** (feed‑level)  
  - Implemented in `ShortsApp` (App.tsx) via `handleMuteToggle`:

    ```ts
    const player = playerRefsByIndex.current[activeIndexRef.current];
    if (!player) return;

    if (isMuted) {
      hasUserInteractedRef.current = true;
      player.unmute?.();
      setIsMuted(false);
    } else {
      player.mute?.();
      setIsMuted(true);
    }
    ```

  - We keep a **single mute flag for the whole feed** and let `playAt` apply that flag whenever the active short changes.

- **Fullscreen**  
  - We fullscreen the **scroll container**, not the individual player:

    ```ts
    const el = scrollRef.current;
    // ...
    (el.requestFullscreen || (el as any).webkitRequestFullscreen)?.call(el);
    ```

  - This keeps scroll snapping and the custom overlays working the same way in fullscreen and windowed modes.

- **Like / Follow / Share**  
  - All handled in React state only (no special FastPix APIs required):
    - `liked` / `followed` booleans for each `ShortItem`.
    - `incrementLabel()` helper for compact like counts (`"12.4K"` → `"12.5K"`).
    - `handleShare()` builds a URL for the current `playbackId` and:
      - Uses `navigator.share(...)` when available.
      - Falls back to `navigator.clipboard.writeText(...)`.

The important idea: **FastPix provides playback and metadata; the app owns all UI state and interactions**. You are free to rearrange or re‑style the controls without touching any streaming logic.

Feel free to copy/paste or adapt any of the source under `my-react-app/src` into your own projects. This demo is meant to be a **working cookbook**, not just a black‑box example.

<br />

## Why we use `disable-keyboard-controls` in this app

By default, FastPix captures many keyboard keys (space, arrows, etc.) to control the player. That is great for standalone players, but in a **shorts feed** it can interfere with app‑level navigation.

In `ShortItem.tsx` we set:

```ts
el.setAttribute("disable-keyboard-controls", "");
```

This tells the player to **ignore keyboard input**, so the app can own it instead. We then implement our own handlers in `ShortsApp`:

```ts
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  wheelSnapTo(activeIndexRef.current + (e.key === "ArrowDown" ? 1 : -1));
}, [wheelSnapTo]);

useEffect(() => {
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleKeyDown]);
```

With this setup:

- **Arrow keys** move to the next/previous short (just like many social apps).  
- FastPix does **not** attempt to change volume/seek in response to those keys.  
- You can extend the same pattern for other keys (e.g. `L` for like, `M` for mute, etc.) entirely at the app level.

This makes keyboard behavior **predictable and app‑specific**, while still letting FastPix handle all media playback under the hood.

<br />

## Which FastPix player or demo for your platform

Building the same experience elsewhere? FastPix has a player and reference demos for other platforms. (Only repositories confirmed to exist are linked here.)

| Platform / use case | FastPix repo |
|---|---|
| Web player component (used in this demo) | [web-player-component](https://github.com/FastPix/web-player-component) |
| Android player | [fastpix-android-player](https://github.com/FastPix/fastpix-android-player) |
| iOS player | [iOS-player](https://github.com/FastPix/iOS-player) |
| iOS player demo (SwiftUI) | [fastpix-ios-player-swiftui-demo](https://github.com/FastPix/fastpix-ios-player-swiftui-demo) |
| Flutter player | [Flutter-Video-Player](https://github.com/FastPix/Flutter-Video-Player) |

More repositories are available in the [FastPix organization](https://github.com/orgs/FastPix/repositories).

<br />

## FAQ

**How do I build a Reels / TikTok-style shorts feed in React?**

Use this repo as a reference. React 19 + Vite renders a vertical, scroll-snapping feed of `<fastpix-player>` cards, and FastPix handles the streaming. See "What FastPix handles vs what this app handles" and "Player methods: play, pause, mute, unmute".

**How do I autoplay the active short and pause the others?**

The app tracks the active index and calls `play()` on it while muting and pausing every other player, through a central `playAt` helper. See "Player methods: play, pause, mute, unmute".

**How do I add vertical scroll-snapping between shorts?**

Snapping (wheel, touch, and keyboard) is handled at the app level, and the player's own keyboard controls are turned off so the app owns navigation. See "Why we use disable-keyboard-controls in this app".

**How do I mute or unmute a whole shorts feed?**

A single feed-level mute flag is applied whenever the active short changes; a toggle handler unmutes on first user interaction (to respect autoplay policy). See "Player methods: play, pause, mute, unmute".

**How do I switch audio or subtitle tracks?**

Call `getAudioTracks` / `setAudioTrack` and `getSubtitleTracks` / `setSubtitleTrack` on the player, and listen to `fastpixtracksready`, `fastpixaudiochange`, and `fastpixsubtitlechange`. See "Audio & subtitle tracks (this demo)".

**How do I render my own captions instead of the built-in ones?**

Set the `hide-native-subtitles` attribute and subscribe to `fastpixsubtitlecue` to draw a custom caption overlay in React. See "Audio & subtitle tracks (this demo)".

**Can I use `<fastpix-player>` as JSX instead of `document.createElement`?**

React 19 can render it as JSX, but this demo uses `document.createElement` for deterministic mount/teardown in a virtualized feed. A first-class React `<FastPixPlayer />` wrapper is in progress. See "Why document.createElement(\"fastpix-player\") instead of JSX?".

**How do I use my own video feed or backend?**

Replace the `SHORTS_FEED` array in `src/shorts/feed.ts` with your own JSON in the documented shape, using your FastPix playback IDs. See "Feed JSON format (universal)".

**Where do I get FastPix playback IDs?**

From your FastPix dashboard, after you upload or ingest your vertical (9:16) assets. See "Prerequisites".

**Does it support HLS?**

Yes. FastPix handles HLS (m3u8) playback, manifests, and buffering at the player level.

**Why does the first short take time to start, and how do I make it instant?**

Most of the delay is the playlist chain (hls.js → master playlist → variant playlists → first segment) and bandwidth competition between players. This demo removes it from the app side with a build-time playlist snapshot, preloads, a fixed start level and a service-worker cache. See "Instant startup".

**How do I add an Explore grid of muted previews?**

Use lightweight `<video>` tiles driven by hls.js at the lowest rendition, playing only while on screen. See "Explore, Playlists and routes".

**How do I build playlists / series with episodes?**

Add entries to `PLAYLISTS` in `src/shorts/feed.ts`; the episode player is the same `ShortsApp` with `feed={playlist.episodes}`, so scrolling stays inside the playlist. See "Explore, Playlists and routes".

**How do I enable FastPix Data analytics?**

Set `VITE_FASTPIX_WORKSPACE_KEY` in `.env.local` and rebuild. The app counts one view per short actually watched. See "FastPix Data (video analytics)".

**How do I hide the built-in player controls and use a custom seekbar?**

Set the FastPix CSS variables to `none` and use `--progress-bar-invisible: 1`, then render your own progress stripe synced to `video.currentTime`. See "Hiding built-in controls and using a custom seekbar".

<br />

## Documentation

For player attributes, methods, and events, see the official [FastPix documentation](https://fastpix.com/docs/web-player/build-a-shorts-feed-with-react). For the audio and subtitle track APIs used here (methods, events, attributes), see **`AUDIO_SUBTITLE_TRACKS_API.md`** at the web-player repo root.
