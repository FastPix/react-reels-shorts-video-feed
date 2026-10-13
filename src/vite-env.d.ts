/// <reference types="vite/client" />

interface ImportMetaEnv {
  // FastPix Data workspace key. When set, every player reports analytics.
  readonly VITE_FASTPIX_WORKSPACE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
