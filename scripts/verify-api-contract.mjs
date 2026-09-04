#!/usr/bin/env node
/**
 * Contract-documentation guard for the frontend-only local mock.
 *
 * This deliberately uses Node built-ins: `docs/api/openapi.yaml` is
 * JSON-compatible YAML, so the check does not add a YAML parser to runtime.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const apiDocsRoot = path.join(root, 'docs/api')
const appRoot = path.join(root, 'src/app')
const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

function fail(message) {
  throw new Error(`API contract verification failed: ${message}`)
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(absolute) : [absolute]
  })
}

function routePathFor(file) {
  const directory = path.dirname(file)
  const segments = path.relative(appRoot, directory).split(path.sep)
  return `/${segments
    .map((segment) => segment.replace(/^\[\.\.\.(.+)]$/, '{$1}').replace(/^\[(.+)]$/, '{$1}'))
    .join('/')}`
}

function sourcePairs() {
  return filesBelow(path.join(appRoot, 'api'))
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(
        (match) => `${match[1]} ${routePathFor(file)}`,
      )
    })
    .sort()
}

function manifestPairs() {
  const manifest = readText('src/contracts/route-manifest.ts')
  return [...manifest.matchAll(/route\(\s*'(GET|POST|PATCH|PUT|DELETE)'\s*,\s*'([^']+)'\s*,/g)]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort()
}

function openApiPairs(document) {
  return Object.entries(document.paths ?? {})
    .flatMap(([routePath, pathItem]) =>
      methods
        .filter((method) => pathItem[method.toLowerCase()])
        .map((method) => `${method} ${routePath}`),
    )
    .sort()
}

function equalList(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} differs\nactual: ${actual.join(', ')}\nexpected: ${expected.join(', ')}`)
  }
}

function canonicalVersion(readme) {
  const match = readme.match(/^Contract version:\s*(\S+)\s*$/m)
  if (!match) fail('docs/api/README.md is missing its canonical Contract version line')
  return match[1]
}

function assertJsonFile(file, label) {
  if (!existsSync(file)) fail(`${label} does not exist: ${path.relative(root, file)}`)
  try {
    JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`${label} is not valid JSON: ${path.relative(root, file)} (${error.message})`)
  }
}

function markdownExampleLinks() {
  return filesBelow(apiDocsRoot)
    .filter((file) => file.endsWith('.md'))
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [...text.matchAll(/\]\((examples\/[^)#]+\.json)\)/g)].map((match) => ({
        file,
        target: match[1],
      }))
    })
}

function validateInternalReferences(value, components) {
  if (!value || typeof value !== 'object') return
  if ('$ref' in value && typeof value.$ref === 'string' && value.$ref.startsWith('#/components/')) {
    const [, , bucket, name] = value.$ref.split('/')
    if (!components?.[bucket]?.[name]) fail(`unresolved internal reference: ${value.$ref}`)
  }
  for (const child of Object.values(value)) validateInternalReferences(child, components)
}

function validatePathParameters(document) {
  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    const pathParameters = routePath.matchAll(/\{([^}]+)\}/g)
    for (const method of methods) {
      const operation = pathItem[method.toLowerCase()]
      if (!operation) continue
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      for (const parameter of pathParameters) {
        const name = parameter[1]
        const match = parameters.find((item) => item?.name === name && item?.in === 'path')
        if (!match?.required) fail(`${method} ${routePath} must require path parameter: ${name}`)
      }
    }
  }
}

try {
  const document = JSON.parse(readText('docs/api/openapi.yaml'))
  const source = sourcePairs()
  const manifest = manifestPairs()
  const openapi = openApiPairs(document)

  equalList('route source and route manifest', manifest, source)
  equalList('route manifest and OpenAPI', openapi, manifest)
  validateInternalReferences(document, document.components)
  validatePathParameters(document)

  const readme = readText('docs/api/README.md')
  const coverage = readText('docs/api/ROUTE_COVERAGE.md')
  const version = canonicalVersion(readme)
  if (document.info?.version !== version) {
    fail(`OpenAPI info.version (${document.info?.version}) differs from README Contract version (${version})`)
  }
  if (!coverage.includes(`Contract version: \`${version}\``)) {
    fail('ROUTE_COVERAGE.md does not repeat the canonical Contract version')
  }

  const pathCount = Object.keys(document.paths ?? {}).length
  const operationCount = openapi.length
  const readmeCount = `OpenAPI 3.1；${pathCount} 个 path、${operationCount} 个 operation`
  const coverageCount = `scope: ${pathCount} paths / ${operationCount} operations`
  if (!readme.includes(readmeCount)) fail(`README.md must state: ${readmeCount}`)
  if (!coverage.includes(coverageCount)) fail(`ROUTE_COVERAGE.md must state: ${coverageCount}`)

  for (const [name, example] of Object.entries(document.components?.examples ?? {})) {
    if (example.externalValue) {
      if (!example.externalValue.startsWith('./examples/')) {
        fail(`${name} externalValue must stay below docs/api/examples`)
      }
      assertJsonFile(path.resolve(apiDocsRoot, example.externalValue), `${name} externalValue`)
    } else if (example.value === undefined) {
      fail(`${name} must declare externalValue or inline value`)
    }
  }

  for (const { file, target } of markdownExampleLinks()) {
    assertJsonFile(path.resolve(path.dirname(file), target), `${path.relative(root, file)} link`)
  }
  for (const exampleFile of filesBelow(path.join(apiDocsRoot, 'examples'))) {
    if (statSync(exampleFile).isFile() && exampleFile.endsWith('.json')) {
      assertJsonFile(exampleFile, 'docs/api/examples fixture')
    }
  }

  console.log(`API contract verified: ${pathCount} paths / ${operationCount} operations / ${version}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
