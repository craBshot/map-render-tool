import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/** Short commit hash shown in the Sidebar footer, so a running build can be matched to GitHub. */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
  },
  server: {
    // Native fs.watch fails on network-mapped drives (this project lives on
    // a Z: SMB share) with "UNKNOWN: unknown error, watch" — polling works
    // reliably there instead.
    watch: {
      usePolling: true,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
})
