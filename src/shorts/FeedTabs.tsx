// "For You" / "Explore" / "Playlists" switcher shown at the top of the feed and
// grid pages. Routing is hash-based (see explore/routes.ts).

export type FeedTab = "forYou" | "explore" | "playlists";

const TABS: { id: FeedTab; label: string; hash: string }[] = [
  // "#" lets the feed reopen the short the viewer was last on.
  { id: "forYou", label: "For You", hash: "#" },
  { id: "explore", label: "Explore", hash: "#explore" },
  { id: "playlists", label: "Playlists", hash: "#playlists" },
];

export function FeedTabs({ active }: { active: FeedTab }) {
  return (
    <nav aria-label="Feeds" style={{ display: "flex", gap: 16 }}>
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              if (!isActive) globalThis.location.hash = tab.hash;
            }}
            style={{
              background: "none",
              border: "none",
              padding: "6px 2px",
              cursor: isActive ? "default" : "pointer",
              color: "#fff",
              opacity: isActive ? 1 : 0.6,
              fontSize: 14,
              whiteSpace: "nowrap",
              fontWeight: 700,
              letterSpacing: "0.01em",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
              borderBottom: `2px solid ${isActive ? "#fff" : "transparent"}`,
              transition: "opacity 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
