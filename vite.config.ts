import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes the build work under any GitHub Pages repository path
// (https://user.github.io/<repo>/) without configuration. Routing uses the URL hash,
// so refreshing any page never needs a server rewrite.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2019', sourcemap: false },
  test: { environment: 'node' },
} as never)
