import type { CSSProperties } from "react";

// Shared page + grid styles for the Explore, Playlists and episode pages.
export const pageStyle: CSSProperties = {
  height: "100dvh",
  overflowY: "auto",
  background: "#000",
  color: "#fff",
};

// 2 columns on phones, up to 4 on desktop.
export const gridStyle: CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "8px 16px 24px",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 8,
};
