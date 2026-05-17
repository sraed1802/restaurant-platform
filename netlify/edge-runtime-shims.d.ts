declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined
  }
}

declare module '@netlify/edge-functions' {
  export interface Context {
    waitUntil(promise: Promise<unknown>): void
  }

  export interface Config {
    path?: string
    excludedPath?: string
    cache?: 'manual' | 'off'
    method?: string | string[]
  }
}
