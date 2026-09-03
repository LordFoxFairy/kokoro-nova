import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { LOCAL_API_ROUTES } from '@/contracts/route-manifest'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type OpenApiOperation = {
  operationId?: string
  'x-ui-triggers'?: string[]
  'x-mock-scenarios'?: string[]
}
type OpenApiDocument = {
  openapi?: string
  paths?: Record<string, Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>>
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(absolute) : [absolute]
  })
}

function sourcePairs(): string[] {
  const appRoot = path.join(process.cwd(), 'src/app')
  const apiRoot = path.join(appRoot, 'api')
  return filesBelow(apiRoot)
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .flatMap((file) => {
      const routePath = `/${path
        .relative(appRoot, path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/^\[\.\.\.(.+)]$/, '{$1}').replace(/^\[(.+)]$/, '{$1}'))
        .join('/')}`
      const source = readFileSync(file, 'utf8')
      const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)]
      return methods.map((match) => `${match[1]} ${routePath}`)
    })
    .sort()
}

function openApiDocument(): OpenApiDocument {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8')) as OpenApiDocument
}

function openApiPairs(document: OpenApiDocument): string[] {
  const methods = ['get', 'post', 'patch', 'put', 'delete'] as const
  return Object.entries(document.paths ?? {})
    .flatMap(([routePath, item]) => methods.filter((method) => item[method]).map((method) => `${method.toUpperCase()} ${routePath}`))
    .sort()
}

describe('local API manifest and OpenAPI', () => {
  it('lists exactly every exported local route method', () => {
    const manifestPairs = LOCAL_API_ROUTES.map((route) => `${route.method} ${route.path}`).sort()
    expect(manifestPairs).toEqual(sourcePairs())
  })

  it('keeps OpenAPI 3.1 paths exactly aligned with the manifest', () => {
    const document = openApiDocument()
    const manifestPairs = LOCAL_API_ROUTES.map((route) => `${route.method} ${route.path}`).sort()

    expect(document.openapi).toBe('3.1.0')
    expect(openApiPairs(document)).toEqual(manifestPairs)
  })

  it('gives every operation a unique ID, UI trigger and reproducible scenario', () => {
    const document = openApiDocument()
    const operationIds = new Set<string>()

    for (const route of LOCAL_API_ROUTES) {
      expect(route.operationId.length, `${route.method} ${route.path}`).toBeGreaterThan(0)
      expect(operationIds.has(route.operationId), route.operationId).toBe(false)
      operationIds.add(route.operationId)
      expect(route.uiTriggers.length, route.operationId).toBeGreaterThan(0)
      expect(route.scenarios.length, route.operationId).toBeGreaterThan(0)

      const operation = document.paths?.[route.path]?.[route.method.toLowerCase() as Lowercase<HttpMethod>]
      expect(operation?.operationId).toBe(route.operationId)
      expect(operation?.['x-ui-triggers']).toEqual(route.uiTriggers)
      expect(operation?.['x-mock-scenarios']).toEqual(route.scenarios)
    }
  })
})
