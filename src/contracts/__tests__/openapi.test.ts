import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { LOCAL_API_ROUTES } from '@/contracts/route-manifest'
import { IMAGE_ASPECT_RATIOS, IMAGE_QUALITIES } from '@/domain/models'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
type OpenApiOperation = {
  operationId?: string
  'x-ui-triggers'?: string[]
  'x-mock-scenarios'?: string[]
  requestBody?: {
    content?: { 'application/json'?: { schema?: { $ref?: string } } }
  }
  responses?: Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }>
}
type OpenApiDocument = {
  openapi?: string
  info?: { version?: string }
  paths?: Record<string, Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>>
  components?: {
    schemas?: Record<
      string,
      {
        properties?: Record<string, { enum?: string[]; $ref?: string; items?: { $ref?: string } }>
      }
    >
  }
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

  it('documents exact Jobs wrappers and keeps polling out of the POST transition', () => {
    const document = openApiDocument()
    const jobs = document.paths?.['/api/jobs']
    const detail = document.paths?.['/api/jobs/{jobId}']

    expect(jobs?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ListJobsResponse',
    )
    expect(jobs?.post?.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/CreateJobRequest',
    )
    expect(jobs?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/CreateJobResponse',
    )
    expect(detail?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/GetJobResponse',
    )
    expect(detail?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/TransitionJobResponse',
    )
    expect(document.components?.schemas?.TransitionJobRequest?.properties?.action?.enum).toEqual([
      'confirm',
      'cancel',
    ])
  })

  it('versions and exposes the persisted Video and Image authoring metadata shapes', () => {
    const document = openApiDocument()

    expect(document.info?.version).toBe('1.5.0-image-authoring-state')
    expect(document.components?.schemas?.WorkflowNode?.properties?.data?.$ref).toBe(
      '#/components/schemas/NodeData',
    )
    expect(document.components?.schemas?.NodeData?.properties?.extra?.$ref).toBe(
      '#/components/schemas/NodeExtra',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.videoMentions?.items?.$ref).toBe(
      '#/components/schemas/VideoReferenceMention',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.elementMarks?.items?.$ref).toBe(
      '#/components/schemas/VideoElementMark',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.imagePreset?.$ref).toBe(
      '#/components/schemas/ImagePresetSelection',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.imageStyle?.$ref).toBe(
      '#/components/schemas/ImageStyleSelection',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.imageTransform?.$ref).toBe(
      '#/components/schemas/ImageTransformSpec',
    )
    expect(document.components?.schemas?.ModelDefinition?.properties?.imageCapabilities?.$ref).toBe(
      '#/components/schemas/ImageModelCapabilities',
    )
    expect(document.components?.schemas?.GenerationOutputSpec?.properties?.quality?.enum).toEqual([
      ...IMAGE_QUALITIES,
    ])
    expect(new Set(document.components?.schemas?.GenerationOutputSpec?.properties?.aspectRatio?.enum)).toEqual(
      new Set(['auto', ...IMAGE_ASPECT_RATIOS]),
    )
  })
})
