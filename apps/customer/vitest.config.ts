import { defineConfig, type UserConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const plugins = [
  react() as unknown as NonNullable<UserConfig['plugins']>[number],
]

export default defineConfig({
  plugins,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
