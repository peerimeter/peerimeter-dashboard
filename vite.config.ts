import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

function dashboardCommit(): string {
  const pagesCommit = process.env.CF_PAGES_COMMIT_SHA
  if (pagesCommit && /^[0-9a-f]{7,40}$/i.test(pagesCommit)) {
    return pagesCommit.slice(0, 12)
  }

  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __DASHBOARD_COMMIT__: JSON.stringify(dashboardCommit()) },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
})
