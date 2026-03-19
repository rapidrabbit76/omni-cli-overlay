import type { OcoAPI } from '../preload/index'

declare module '*.mp3' {
  const src: string
  export default src
}

declare global {
  interface Window {
    oco: OcoAPI
  }
}
