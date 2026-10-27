// Stacked-cards icon marking a playlist.
export function PlaylistIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="14" height="14" rx="2" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" />
      <polygon points="8.5 11 8.5 17 13 14 8.5 11" fill="currentColor" stroke="none" />
    </svg>
  );
}
