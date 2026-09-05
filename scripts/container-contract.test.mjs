import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const image = 'ghcr.io/lordfoxfairy/kokoro-nova'

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

test('Docker, tagged GHCR publishing, and README demo use one image contract', () => {
  const readme = read('README.md')
  const dockerfile = read('Dockerfile')
  const workflow = read('.github/workflows/ci.yml')

  assert.match(workflow, /tags:\n\s+- 'v\*'/)
  assert.match(workflow, new RegExp(`IMAGE_NAME: ${image.replaceAll('/', '\\/')}`))
  assert.match(
    workflow,
    /Static container delivery contract\n\s+run: node --test scripts\/container-contract\.test\.mjs/,
  )
  assert.match(workflow, /tags: \|\n\s+type=semver,pattern=\{\{version\}\}/)
  assert.match(workflow, /type=raw,value=latest/)
  assert.match(workflow, /type=sha,format=long/)
  assert.match(workflow, /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/v'\)/)
  assert.match(workflow, /needs: \[verify, e2e\]/)
  assert.match(workflow, /VERSION=\$\{\{ steps\.meta\.outputs\.version \}\}/)
  assert.match(workflow, /VCS_REF=\$\{\{ github\.sha \}\}/)

  assert.match(dockerfile, new RegExp(`org\.opencontainers\.image\.source="https:\/\/github\.com\/LordFoxFairy\/kokoro-nova"`))
  assert.match(dockerfile, /ARG VERSION=dev/)
  assert.match(dockerfile, /ARG VCS_REF=unknown/)
  assert.match(dockerfile, /org\.opencontainers\.image\.version="\$\{VERSION\}"/)
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{VCS_REF\}"/)
  assert.match(dockerfile, /PORT=3200/)
  assert.match(dockerfile, /HOSTNAME=0\.0\.0\.0/)
  assert.match(dockerfile, /EXPOSE 3200/)
  assert.match(dockerfile, /VOLUME \["\/app\/\.data"\]/)

  assert.match(readme, new RegExp(`docker pull ${image.replaceAll('/', '\\/')}:latest`))
  const documentedRunCommand = [
    `docker run --rm -p 3200:3200 -v kokoro-nova-data:/app/.data ${String.fromCharCode(92)}`,
    `  ${image}:latest`,
  ].join('\n')
  assert.ok(readme.includes(documentedRunCommand), 'README demo command must match the published image')
})
