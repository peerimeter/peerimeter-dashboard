/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVICE_URL?: string
  readonly VITE_ALLOW_INSECURE_HTTP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
