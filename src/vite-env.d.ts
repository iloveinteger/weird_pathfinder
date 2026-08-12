/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROVIDER_MODE?: 'mock' | 'real'
  readonly VITE_KAKAO_JAVASCRIPT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
