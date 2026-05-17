import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
var plugins = [
    react(),
];
export default defineConfig({
    plugins: plugins,
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
    },
});
