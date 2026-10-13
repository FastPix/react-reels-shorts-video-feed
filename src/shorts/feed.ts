export type ShortMeta = {
  id: string;
  creator: string;
  title: string;
  likes: string;
  comments: string;
  shares: string;
  // Set for playlist episodes.
  episode?: number;
  series?: string;
};

export type Playlist = {
  id: string;
  title: string;
  creator: string;
  episodes: ShortMeta[];
};

// Demo feed – replace with real API data in your app.
export const SHORTS_FEED: ShortMeta[] = [
  {
    id: "e089311f-e6a5-48fa-ac92-3bbe3fec31eb",
    creator: "telugubeats",
    title: "Ragili Chedipotnunna 🎵",
    likes: "12.4K",
    comments: "342",
    shares: "891",
  },
  {
    id: "2125094c-db43-4748-90e1-18539f2ccf98",
    creator: "tollywood_edits",
    title: "Mahaan Beats 🔥 | Best Telugu BGM",
    likes: "8.7K",
    comments: "201",
    shares: "543",
  },
  {
    id: "e1f32b9b-ac57-4582-a7c5-90aa6f96baac",
    creator: "prima_music",
    title: "Telugu Prima 🎶 | Feel the vibe",
    likes: "21K",
    comments: "987",
    shares: "2.1K",
  },
  {
    id: "c655164e-2f08-47d5-a3eb-4e3bf2d444df",
    creator: "helu_tunes",
    title: "Helu Vibes 💫 | Trending Now",
    likes: "5.3K",
    comments: "118",
    shares: "310",
  },
 
];

const DEMO_SERIES = "Telugu Beats · Season 1";

// Demo playlist – reuses the feed's videos as episodes. Replace with real
// episode playback IDs (and titles) from your API.
export const PLAYLISTS: Playlist[] = [
  {
    id: "telugu-beats-s1",
    title: DEMO_SERIES,
    creator: "telugubeats",
    episodes: SHORTS_FEED.map((short, i) => ({
      ...short,
      episode: i + 1,
      series: DEMO_SERIES,
    })),
  },
];
