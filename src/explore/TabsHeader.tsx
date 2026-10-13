import { FeedTabs, type FeedTab } from "../shorts/FeedTabs";

// Sticky header for the grid pages: logo + feed tabs.
export function TabsHeader({ active }: { active: FeedTab }) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px 16px",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <img
        src="https://dashboard.fastpix.io/images/fastpix.png"
        alt="FastPix"
        style={{ position: "absolute", left: 16, height: 24, width: "auto", objectFit: "contain" }}
      />
      <FeedTabs active={active} />
    </header>
  );
}
