import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = await mkdtemp(join(tmpdir(), 'peerimeter-dashboard-demo-'))
const playwright = join(root, 'node_modules', '@playwright', 'test', 'cli.js')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`)
}

async function findVideo(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = await findVideo(path)
      if (found) return found
    } else if (entry.name.endsWith('.webm')) return path
  }
  return undefined
}

try {
  run(process.execPath, [playwright, 'test', '--grep', 'API-key login, network creation', '--workers=1', `--output=${output}`], {
    env: { ...process.env, PEERIMETER_DEMO: '1' },
  })

  const video = await findVideo(output)
  if (!video) throw new Error('Playwright completed without producing a demo video.')

  run('ffmpeg', [
    '-y', '-i', video,
    '-filter_complex',
    '[0:v]fps=15,scale=1600:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a',
    '-loop', '0', join(root, 'public', 'dashboard-demo.gif'),
  ])

  console.log('Wrote public/dashboard-demo.gif')
} finally {
  await rm(output, { recursive: true, force: true })
}
