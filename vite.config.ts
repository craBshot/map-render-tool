import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Native fs.watch fails on network-mapped drives (this project lives on
    // a Z: SMB share) with "UNKNOWN: unknown error, watch" — polling works
    // reliably there instead.
    watch: {
      usePolling: true,
    },
  },
})
