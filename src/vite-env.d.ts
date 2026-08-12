/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROVIDER_MODE?: 'mock' | 'real'
  readonly VITE_KAKAO_JAVASCRIPT_KEY?: string
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
