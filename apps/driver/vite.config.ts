import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')
const plugins: PluginOption[] = [react() as unknown as PluginOption]

/** Split large vendor trees so the browser can fetch/cache them in parallel. */
function vendorChunk(id: string): string | undefined {
  const m = id.match(/[/\\]node_modules[/\\](@[^/\\]+[/\\][^/\\]+|[^/\\]+)/)
  const pkg = m?.[1]
  if (!pkg) return undefined
  if (pkg.startsWith('@supabase')) return 'vendor-supabase'
  if (pkg.startsWith('@tanstack')) return 'vendor-query'
  if (pkg.startsWith('@sentry')) return 'vendor-sentry'
  if (pkg === 'recharts') return 'vendor-recharts'
  if (pkg.startsWith('react-router')) return 'vendor-router'
  if (pkg === 'framer-motion') return 'vendor-motion'
  if (pkg === 'zod') return 'vendor-zod'
  if (pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react-dom'
  if (pkg === 'react') return 'vendor-react'
  return undefined
}

export default defineConfig({
  plugins,
  envDir: path.resolve(workspaceRoot, 'apps/admin'),
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@rms/platform': path.resolve(workspaceRoot, 'packages/platform/src/index.ts'),
      '@rms/supabase': path.resolve(workspaceRoot, 'packages/supabase'),
      react: path.resolve(workspaceRoot, 'node_modules/react'),
      'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'zustand',
      '@tanstack/react-query',
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    /** Listen on LAN so phones/tunnels can open http://<your-ip>:5175 */
    host: true,
    /**
     * Cloudflare quick Tunnel uses random *.trycloudflare.com Host headers.
     * Leading `.` allows that hostname and all subdomains (see Vite server.allowedHosts docs).
     */
    allowedHosts: ['localhost', '.localhost', '.trycloudflare.com'],
    /** Omit fixed HMR host so ws:// matches how you open the app (127.0.0.1, LAN IP, tunnel). */
  },
})
