import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.tsx'

// Instant-start cache for playlists/segments/posters (see public/sw.js). Only
// helps from the second load on; the first visit populates it.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("Service worker registration failed", err);
  });
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element "#root" was not found in the document.')
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
