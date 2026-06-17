/// <reference types="vite-plugin-pwa/client" />
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_BANNER_ENABLED?: string
  readonly VITE_BANNER_MESSAGE?: string
  readonly VITE_BANNER_LINK?: string
  readonly VITE_BANNER_ID?: string
}
