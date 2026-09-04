import { spawn } from 'node:child_process'
import process from 'node:process'

const isSmoke = process.argv.includes('--smoke')
const port = process.env.DEMO_PORT ?? process.env.PORT ?? '3300'
const dataDir = process.env.DEMO_DATA_DIR ?? process.env.DATA_DIR ?? '.demo-data'
const distDir = process.env.DEMO_NEXT_DIST_DIR ?? process.env.NEXT_DIST_DIR ?? '.next-demo'
const baseUrl = `http://127.0.0.1:${port}`
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const child = spawn(pnpm, ['exec', 'next', 'dev', '--turbopack', '-p', port], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: port,
    DATA_DIR: dataDir,
    NEXT_DIST_DIR: distDir,
  },
  stdio: 'inherit',
})

let stopping = false

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  child.kill(signal)
}

async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`${url} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'server did not respond'}`)
}

async function smoke() {
  await waitFor(`${baseUrl}/`)
  const scenario = await waitFor(`${baseUrl}/api/dev/scenario`)
  const body = await scenario.json()
  if (!body || typeof body.scenario?.id !== 'string') {
    throw new Error('Demo scenario endpoint returned an invalid fixture envelope')
  }
  console.log(`Demo smoke passed: ${baseUrl}/ (${body.scenario.id}, DATA_DIR=${dataDir}, NEXT_DIST_DIR=${distDir})`)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}

child.once('error', (error) => {
  console.error(`Failed to start demo server: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (!isSmoke && !stopping) process.exitCode = code ?? (signal ? 1 : 0)
})

if (isSmoke) {
  try {
    await smoke()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    stop()
  }
}
