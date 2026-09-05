import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { LOCAL_API_ROUTES } from '@/contracts/route-manifest'
import { IMAGE_ASPECT_RATIOS, IMAGE_QUALITIES } from '@/domain/models'
import stateExample from '../../../docs/api/examples/script-v2-state.json'
import quoteRequestExample from '../../../docs/api/examples/script-v2-quote.request.json'
import quoteResponseExample from '../../../docs/api/examples/script-v2-quote.response.json'
import runRequestExample from '../../../docs/api/examples/script-v2-run.request.json'
import runResponseExample from '../../../docs/api/examples/script-v2-run.response.json'
import officialRecomputeExample from '../../../docs/api/examples/script-v2-official-recompute.sanitized.json'
import materialsStyleExample from '../../../docs/api/examples/materials-style.response.json'
import materialsDetailExample from '../../../docs/api/examples/materials-detail.response.json'
import materialsFavouriteRequestExample from '../../../docs/api/examples/materials-favourite.request.json'
import materialsFavouriteResponseExample from '../../../docs/api/examples/materials-favourite.response.json'
import {
  CreateScriptV2RunRequestSchema,
  OfficialPromptRecomputeEnvelopeSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunResponseSchema,
  ScriptV2StateSchema,
} from '@/contracts/script-v2'
import {
  GetMaterialResponseSchema,
  MaterialCatalogResponseSchema,
  ToggleMaterialFavouriteRequestSchema,
  ToggleMaterialFavouriteResponseSchema,
} from '@/contracts/materials'
import {
  AccessKeyCommandRequestSchema,
  AccessKeyResponseSchema,
  AccountExternalHandoffsResponseSchema,
} from '@/contracts/account-external'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const CONTRACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
type OpenApiOperation = {
  operationId?: string
  tags?: string[]
  security?: Array<Record<string, string[]>>
  'x-authorization'?: 'public' | 'local-display-projection' | 'authenticated' | 'owner' | 'workspace'
  'x-ui-triggers'?: string[]
  'x-mock-scenarios'?: string[]
  requestBody?: {
    required?: boolean
    content?: Record<string, {
      schema?: { $ref?: string }
      examples?: Record<string, { value?: unknown }>
    }>
  }
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>
  responses?: Record<string, {
    content?: Record<string, {
      schema?: { $ref?: string; type?: string; format?: string; oneOf?: Array<{ $ref?: string }> }
      examples?: Record<string, { value?: unknown }>
    }>
  }>
}
type OpenApiDocument = {
  openapi?: string
  info?: { version?: string }
  servers?: Array<{ url?: string }>
  components?: {
    examples?: Record<string, { externalValue?: string; value?: unknown }>
    securitySchemes?: Record<string, { type?: string; scheme?: string; bearerFormat?: string }>
    schemas?: Record<
      string,
      {
        required?: string[]
        properties?: Record<string, { enum?: string[]; $ref?: string; items?: { $ref?: string } }>
        oneOf?: unknown[]
        minProperties?: number
        additionalProperties?: boolean
        [key: string]: unknown
      }
    >
  }
  paths?: Record<string, Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>>
  [key: `x-${string}`]: unknown
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

function documentedContractVersion(): string {
  const readme = readFileSync(path.join(process.cwd(), 'docs/api/README.md'), 'utf8')
  const match = readme.match(/^Contract version:\s*(\S+)\s*$/m)
  expect(match, 'docs/api/README.md Contract version').not.toBeNull()
  return match![1]
}

function openApiPairs(document: OpenApiDocument): string[] {
  const methods = ['get', 'post', 'patch', 'put', 'delete'] as const
  return Object.entries(document.paths ?? {})
    .flatMap(([routePath, item]) => methods.filter((method) => item[method]).map((method) => `${method.toUpperCase()} ${routePath}`))
    .sort()
}

function operationAt(document: OpenApiDocument, method: HttpMethod, routePath: string): OpenApiOperation {
  const operation = document.paths?.[routePath]?.[method.toLowerCase() as Lowercase<HttpMethod>]
  expect(operation, `${method} ${routePath}`).toBeDefined()
  return operation as OpenApiOperation
}

function responseSchemaRef(operation: OpenApiOperation, status: string): string | undefined {
  return operation.responses?.[status]?.content?.['application/json']?.schema?.$ref
}

function successContentTypes(operation: OpenApiOperation): string[] {
  return Object.keys(operation.responses?.['200']?.content ?? {}).sort()
}

function documentedOperations(document: OpenApiDocument): Array<[HttpMethod, string]> {
  return openApiPairs(document).map((pair) => {
    const [method, routePath] = pair.split(' ', 2)
    return [method as HttpMethod, routePath]
  })
}

const PUBLIC_OPERATIONS = new Set([
  'GET /api/home',
  'GET /api/materials',
  'GET /api/materials/{materialId}',
  'GET /api/media/{path}',
  'GET /api/models',
  'GET /api/preview/character',
  'GET /api/preview/stitch',
  'GET /api/publish',
  'GET /api/publish/{snapshotId}',
  'GET /api/showcase',
  'GET /api/showcase/{snapshotId}',
  'GET /api/showcase/{snapshotId}/playback',
  'GET /api/showcase/{snapshotId}/engagement',
  'GET /api/skills',
  'GET /api/skills/{skillId}',
])

const LOCAL_DISPLAY_PROJECTION_OPERATIONS = new Set([
  'GET /api/account',
  'GET /api/account/handoffs',
  'GET /api/identity',
  'GET /api/preferences',
  'GET /api/notifications',
  'GET /api/team',
  'GET /api/shared-assets',
])

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

      const contentTypes = successContentTypes(operation as OpenApiOperation)
      if (route.transport === 'json') expect(contentTypes).toEqual(['application/json'])
      if (route.transport === 'sse') expect(contentTypes).toEqual(['text/event-stream'])
      if (route.transport === 'binary') {
        expect(contentTypes).toHaveLength(1)
        expect(contentTypes).not.toContain('application/json')
      }
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
      'retry',
    ])
  })

  it('documents recycle-bin retention, restore and permanent-delete responses', () => {
    const document = openApiDocument()
    expect(responseSchemaRef(operationAt(document, 'DELETE', '/api/projects/{projectId}'), '200')).toBe(
      '#/components/schemas/ProjectRecycleResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'GET', '/api/recycle-bin'), '200')).toBe(
      '#/components/schemas/ListRecycleBinResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'POST', '/api/recycle-bin/{projectId}'), '200')).toBe(
      '#/components/schemas/RestoreRecycledProjectResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'DELETE', '/api/recycle-bin/{projectId}'), '200')).toBe(
      '#/components/schemas/PermanentlyDeleteRecycledProjectResponse',
    )
  })

  it('publishes a non-empty SemVer contract version consistent with the API README', () => {
    const version = openApiDocument().info?.version
    const readme = readFileSync(path.join(process.cwd(), 'docs/api/README.md'), 'utf8')

    expect(version).toEqual(expect.any(String))
    expect(version).not.toBe('')
    expect(version).toMatch(CONTRACT_VERSION_PATTERN)
    expect(version).toBe(documentedContractVersion())
    expect(readme).toContain('55 个 path、92 个 operation')
    expect(readme).not.toMatch(/47 个 path\s*\/\s*82 个 operation|所有 82 个 operation/)
  })

  it('defines the backend-handoff bearer contract and operation authorization boundaries', () => {
    const document = openApiDocument()

    expect(document.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })

    for (const [method, routePath] of documentedOperations(document)) {
      const operation = operationAt(document, method, routePath)
      const pair = `${method} ${routePath}`

      if (PUBLIC_OPERATIONS.has(pair)) {
        expect(operation['x-authorization'], pair).toBe('public')
        expect(operation.security, pair).toEqual([])
      } else if (LOCAL_DISPLAY_PROJECTION_OPERATIONS.has(pair)) {
        expect(operation['x-authorization'], pair).toBe('local-display-projection')
        expect(operation.security, pair).toEqual([])
      } else {
        expect(operation['x-authorization'], pair).toMatch(/^(authenticated|owner|workspace)$/)
        expect(operation.security, pair).toEqual([{ bearerAuth: [] }])
      }
    }
  })

  it('uses normalized ErrorResponse schemas for the backend handoff while retaining legacy runtime compatibility in docs', () => {
    const document = openApiDocument()
    const errors = readFileSync(path.join(process.cwd(), 'docs/api/ERRORS.md'), 'utf8')

    expect(document.components?.schemas?.ErrorResponse).toBeDefined()
    expect(document.components?.schemas?.LegacyErrorResponse).toBeDefined()
    expect(errors).toContain('迁移边界')
    expect(errors).toContain('LegacyErrorResponse')

    for (const [method, routePath] of documentedOperations(document)) {
      const operation = operationAt(document, method, routePath)
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (Number(status) < 400) continue
        if (`${method} ${routePath}` === 'GET /api/media/{path}') {
          expect(response.content?.['text/plain; charset=utf-8']?.schema, `${method} ${routePath} ${status}`).toMatchObject({
            type: 'string',
          })
          continue
        }
        expect(response.content?.['application/json']?.schema?.$ref, `${method} ${routePath} ${status}`).toBe(
          '#/components/schemas/ErrorResponse',
        )
      }
    }

    const media = operationAt(document, 'GET', '/api/media/{path}')
    expect(media.responses?.['200']).toMatchObject({
      headers: expect.objectContaining({
        'Content-Length': expect.any(Object),
        'Cache-Control': expect.any(Object),
        'Content-Security-Policy': expect.any(Object),
        'X-Content-Type-Options': expect.any(Object),
      }),
    })

    for (const previewPath of ['/api/preview/character', '/api/preview/stitch']) {
      expect(operationAt(document, 'GET', previewPath).responses?.['200']).toMatchObject({
        headers: expect.objectContaining({
          'Cache-Control': expect.objectContaining({
            schema: expect.objectContaining({ example: 'public, max-age=86400' }),
          }),
        }),
      })
    }
  })

  it('provides executable account-boundary examples without exposing an Access Key secret', () => {
    const document = openApiDocument()
    const accessKey = operationAt(document, 'GET', '/api/access-key')
    const accessKeyCommand = operationAt(document, 'POST', '/api/access-key')
    const handoffs = operationAt(document, 'GET', '/api/account/handoffs')

    const activeKey = accessKey.responses?.['200']?.content?.['application/json']?.examples?.active?.value
    const createCommand = accessKeyCommand.requestBody?.content?.['application/json']?.examples?.create?.value
    const createdKey = accessKeyCommand.responses?.['200']?.content?.['application/json']?.examples?.created?.value
    const readyHandoffs = handoffs.responses?.['200']?.content?.['application/json']?.examples?.ready?.value

    expect(AccessKeyResponseSchema.parse(activeKey)).toMatchObject({ key: { state: 'active' } })
    expect(AccessKeyCommandRequestSchema.parse(createCommand)).toEqual({ action: 'create', idempotencyKey: 'access-key-create-example' })
    expect(AccessKeyResponseSchema.parse(createdKey)).toMatchObject({ key: { state: 'active', generation: 1 } })
    expect(AccountExternalHandoffsResponseSchema.parse(readyHandoffs)).toMatchObject({
      state: 'ready',
      subscription: { action: 'open-subscription' },
    })
    expect(JSON.stringify({ activeKey, createCommand, createdKey, readyHandoffs })).not.toMatch(/(?:sk-|secret|token)/i)
  })

  it('keeps the standalone documentation audit executable', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-api-contract.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(output.trim()).toBe(
      `API contract verified: ${Object.keys(openApiDocument().paths ?? {}).length} paths / ${openApiPairs(openApiDocument()).length} operations / ${documentedContractVersion()}`,
    )
  })

  it('exposes the persisted Video, Image, Audio and Text authoring metadata shapes', () => {
    const document = openApiDocument()

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
    expect(document.components?.schemas?.NodeExtra?.properties?.audioAuthoring?.$ref).toBe(
      '#/components/schemas/AudioAuthoringState',
    )
    expect(document.components?.schemas?.NodeExtra?.properties?.textAuthoring?.$ref).toBe(
      '#/components/schemas/TextAuthoringState',
    )
    expect(document.components?.schemas?.ModelDefinition?.properties?.imageCapabilities?.$ref).toBe(
      '#/components/schemas/ImageModelCapabilities',
    )
    expect(document.components?.schemas?.ModelDefinition?.properties?.audioCapabilities?.$ref).toBe(
      '#/components/schemas/AudioModelCapabilities',
    )
    expect(document.components?.schemas?.ModelDefinition?.properties?.textCapabilities?.$ref).toBe(
      '#/components/schemas/TextModelCapabilities',
    )
    expect(document.components?.schemas?.GenerationOutputSpec?.properties?.quality?.enum).toEqual([
      ...IMAGE_QUALITIES,
    ])
    expect(new Set(document.components?.schemas?.GenerationOutputSpec?.properties?.aspectRatio?.enum)).toEqual(
      new Set(['auto', ...IMAGE_ASPECT_RATIOS]),
    )
    expect(document.components?.schemas?.GenerationOutputSpec?.properties?.sampleRate?.enum).toEqual([
      '8k',
      '16k',
      '24k',
      '48k',
    ])
    expect(document.components?.schemas?.GenerationOutputSpec?.properties?.soundEffect?.enum).toEqual([
      'none',
      'echo',
      'hall',
      'telephone',
      'electronic',
    ])
  })

  it('documents all four Script V2 routes and keeps all six examples executable', () => {
    const document = openApiDocument()
    const scriptRoutes = LOCAL_API_ROUTES.filter((route) => route.tag === 'Script V2')

    expect(scriptRoutes).toHaveLength(4)
    expect(scriptRoutes.map((route) => route.operationId)).toEqual([
      'quoteScriptV2',
      'createScriptV2Run',
      'getScriptV2Run',
      'transitionScriptV2Run',
    ])

    for (const route of scriptRoutes) {
      const operation = document.paths?.[route.path]?.[route.method.toLowerCase() as Lowercase<HttpMethod>]
      expect(operation?.operationId).toBe(route.operationId)
      expect(operation?.['x-ui-triggers']).toEqual(route.uiTriggers)
      expect(operation?.['x-mock-scenarios']).toEqual(route.scenarios)
      expect(operation?.responses?.['200']?.content?.['application/json']?.schema?.$ref).toBe(
        '#/components/schemas/' +
          (route.operationId === 'quoteScriptV2' ? 'ScriptV2QuoteResponse' : 'ScriptV2RunResponse'),
      )
    }

    expect(document.components?.schemas?.ScriptV2State?.properties?.promptBatchRuns?.items?.$ref).toBe(
      '#/components/schemas/ScriptV2PromptBatchRun',
    )
    expect(document.components?.schemas?.CreateScriptV2RunRequest?.oneOf?.length).toBe(4)
    expect(document.components?.schemas?.ScriptV2Run?.oneOf?.length).toBe(4)

    expect(ScriptV2StateSchema.parse(stateExample)).toEqual(stateExample)
    expect(ScriptV2QuoteRequestSchema.parse(quoteRequestExample)).toEqual(quoteRequestExample)
    expect(ScriptV2QuoteResponseSchema.parse(quoteResponseExample)).toEqual(quoteResponseExample)
    expect(CreateScriptV2RunRequestSchema.parse(runRequestExample)).toEqual(runRequestExample)
    expect(ScriptV2RunResponseSchema.parse(runResponseExample)).toEqual(runResponseExample)
    expect(OfficialPromptRecomputeEnvelopeSchema.parse(officialRecomputeExample)).toEqual(
      officialRecomputeExample,
    )
  })

  it('documents public discovery, showcase, ledger and Skill marketplace boundaries', () => {
    const document = openApiDocument()

    expect(responseSchemaRef(operationAt(document, 'GET', '/api/home'), '200')).toBe(
      '#/components/schemas/HomeDiscoveryResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'GET', '/api/models'), '200')).toBe(
      '#/components/schemas/ModelCatalogResponse',
    )
    expect(operationAt(document, 'POST', '/api/canvases/{canvasId}').requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/MutationRequest',
    )
    expect(responseSchemaRef(operationAt(document, 'POST', '/api/canvases/{canvasId}'), '200')).toBe(
      '#/components/schemas/MutationResult',
    )
    expect(responseSchemaRef(operationAt(document, 'GET', '/api/ledger'), '200')).toBe(
      '#/components/schemas/LedgerViewProjection',
    )

    expect(responseSchemaRef(operationAt(document, 'GET', '/api/publish'), '200')).toBe(
      '#/components/schemas/ListPublishedSnapshotsResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'POST', '/api/publish'), '200')).toBe(
      '#/components/schemas/PublishCanvasResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'GET', '/api/publish/{snapshotId}'), '200')).toBe(
      '#/components/schemas/GetPublishedSnapshotResponse',
    )
    expect(responseSchemaRef(operationAt(document, 'DELETE', '/api/publish/{snapshotId}'), '200')).toBe(
      '#/components/schemas/RevokePublishedSnapshotResponse',
    )

    const skills = operationAt(document, 'GET', '/api/skills')
    expect(skills.responses?.['200']?.content?.['application/json']?.schema?.oneOf).toEqual([
      { $ref: '#/components/schemas/SkillListResponse' },
      { $ref: '#/components/schemas/SkillComposerContextResponse' },
      { $ref: '#/components/schemas/SkillComposerModesResponse' },
    ])
    expect(responseSchemaRef(operationAt(document, 'GET', '/api/skills/{skillId}'), '200')).toBe(
      '#/components/schemas/GetSkillResponse',
    )
    const favourite = operationAt(document, 'POST', '/api/skills/{skillId}')
    expect(responseSchemaRef(favourite, '200')).toBe(
      '#/components/schemas/ToggleSkillFavouriteResponse',
    )
    expect(favourite.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ToggleSkillFavouriteRequest',
    )
    expect(document.components?.schemas?.ToggleSkillFavouriteRequest?.properties?.action?.enum).toEqual([
      'favourite',
      'unfavourite',
    ])
    expect(skills.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'category', in: 'query' }),
        expect.objectContaining({ name: 'collection', in: 'query' }),
        expect.objectContaining({ name: 'q', in: 'query' }),
        expect.objectContaining({ name: 'composer', in: 'query' }),
        expect.objectContaining({ name: 'fixture', in: 'query' }),
      ]),
    )
    expect(Object.keys(skills.responses ?? {}).filter((status) => status !== '200').sort()).toEqual(['400', '500', '503'])
    expect(document.components?.schemas?.SkillComposerContextResponse?.oneOf).toEqual([
      { $ref: '#/components/schemas/SkillComposerAssetContextResponse' },
      { $ref: '#/components/schemas/SkillComposerSkillContextResponse' },
    ])
  })

  it('documents the independent style/effect catalog, pagination and favourite boundary', () => {
    const document = openApiDocument()
    const list = operationAt(document, 'GET', '/api/materials')
    const detail = operationAt(document, 'GET', '/api/materials/{materialId}')
    const favourite = operationAt(document, 'POST', '/api/materials/{materialId}')

    expect(responseSchemaRef(list, '200')).toBe('#/components/schemas/MaterialCatalogResponse')
    expect(responseSchemaRef(detail, '200')).toBe('#/components/schemas/GetMaterialResponse')
    expect(responseSchemaRef(favourite, '200')).toBe('#/components/schemas/ToggleMaterialFavouriteResponse')
    expect(favourite.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/ToggleMaterialFavouriteRequest',
    )
    expect(list.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'scope', in: 'query' }),
        expect.objectContaining({ name: 'category', in: 'query' }),
        expect.objectContaining({ name: 'commercialOnly', in: 'query' }),
        expect.objectContaining({ name: 'modelId', in: 'query' }),
        expect.objectContaining({ name: 'offset', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
      ]),
    )
    expect(document.components?.schemas?.MaterialCatalogItem?.properties?.modelIds?.items?.$ref).toBeUndefined()
    expect(document.components?.schemas?.ToggleMaterialFavouriteRequest?.properties?.action?.enum).toEqual([
      'favourite',
      'unfavourite',
    ])
    expect(MaterialCatalogResponseSchema.parse(materialsStyleExample)).toEqual(materialsStyleExample)
    expect(GetMaterialResponseSchema.parse(materialsDetailExample)).toEqual(materialsDetailExample)
    expect(ToggleMaterialFavouriteRequestSchema.parse(materialsFavouriteRequestExample)).toEqual(
      materialsFavouriteRequestExample,
    )
    expect(ToggleMaterialFavouriteResponseSchema.parse(materialsFavouriteResponseExample)).toEqual(
      materialsFavouriteResponseExample,
    )
  })

  it('tightens project/folder writes, development fixtures and the ephemeral presence transport', () => {
    const document = openApiDocument()

    const createProject = operationAt(document, 'POST', '/api/projects')
    expect(createProject.requestBody?.required).toBe(false)
    expect(responseSchemaRef(createProject, '200')).toBe('#/components/schemas/CreateProjectResponse')

    const createFolder = operationAt(document, 'POST', '/api/folders')
    expect(createFolder.requestBody).toBeUndefined()
    expect(responseSchemaRef(createFolder, '200')).toBe('#/components/schemas/Folder')

    const updateFolder = operationAt(document, 'PATCH', '/api/folders/{folderId}')
    expect(updateFolder.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/UpdateFolderRequest',
    )
    expect(document.components?.schemas?.UpdateFolderRequest).toMatchObject({
      minProperties: 1,
      additionalProperties: false,
      properties: expect.objectContaining({
        name: expect.any(Object),
        coverUrl: expect.any(Object),
      }),
    })

    const deleteFolder = operationAt(document, 'DELETE', '/api/folders/{folderId}')
    expect(responseSchemaRef(deleteFolder, '200')).toBe('#/components/schemas/FolderDeleteResponse')
    expect(deleteFolder.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'confirmName', in: 'query', required: true })]),
    )

    expect(responseSchemaRef(operationAt(document, 'PATCH', '/api/projects/{projectId}'), '200')).toBe(
      '#/components/schemas/Project',
    )
    expect(responseSchemaRef(operationAt(document, 'DELETE', '/api/projects/{projectId}'), '200')).toBe(
      '#/components/schemas/ProjectRecycleResponse',
    )
    const duplicateProject = operationAt(document, 'PUT', '/api/projects/{projectId}')
    expect(duplicateProject.requestBody).toBeUndefined()
    expect(responseSchemaRef(duplicateProject, '200')).toBe('#/components/schemas/Project')

    const presenceStream = operationAt(document, 'GET', '/api/presence/{canvasId}')
    expect(successContentTypes(presenceStream)).toEqual(['text/event-stream'])
    expect(presenceStream.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'participantId', in: 'query', required: true }),
        expect.objectContaining({ name: 'name', in: 'query', required: true }),
        expect.objectContaining({ name: 'color', in: 'query', required: true }),
      ]),
    )
    const heartbeat = operationAt(document, 'POST', '/api/presence/{canvasId}')
    expect(heartbeat.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/PresenceUpdateRequest',
    )
    expect(responseSchemaRef(heartbeat, '200')).toBe('#/components/schemas/PresenceUpdateResponse')
    expect(Object.keys(heartbeat.responses ?? {}).filter((status) => status !== '200').sort()).toEqual(['400', '409', '429', '500'])

    expect(responseSchemaRef(operationAt(document, 'POST', '/api/dev/reset'), '200')).toBe(
      '#/components/schemas/ResetScenarioResponse',
    )
  })

  it('pins key surface request/response schemas and handler-accurate HTTP statuses', () => {
    const document = openApiDocument()
    const contracts: Array<[
      HttpMethod,
      string,
      string | null,
      string,
      string[],
    ]> = [
      ['POST', '/api/agent/sessions', null, 'AgentSession', ['400', '500']],
      ['GET', '/api/agent/sessions', null, 'AgentSessionsResponse', ['500']],
      ['GET', '/api/agent/sessions/{sessionId}', null, 'AgentSessionDetailResponse', ['404', '500']],
      ['PATCH', '/api/agent/sessions/{sessionId}', 'UpdateAgentSessionRequest', 'AgentSession', ['400', '404', '500']],
      ['DELETE', '/api/agent/sessions/{sessionId}', null, 'AgentDeleteResponse', ['500']],
      ['POST', '/api/agent/sessions/{sessionId}/messages', 'SendAgentMessageRequest', 'AgentMessagesResponse', ['400', '404', '500']],
      ['PATCH', '/api/agent/sessions/{sessionId}/messages', 'ResolveAgentMessageRequest', 'AgentMessagesResponse', ['400', '404', '500']],
      ['GET', '/api/assets', null, 'AssetLifecycleListResponse', ['500']],
      ['POST', '/api/assets', 'RegisterAssetRequest', 'AssetLifecycleView', ['400', '500']],
      ['PATCH', '/api/assets/{assetId}', 'UpdateAssetRequest', 'AssetLifecycleView', ['400', '404', '409', '410', '500']],
      ['DELETE', '/api/assets/{assetId}', null, 'AssetLifecycleView', ['404', '500']],
      ['GET', '/api/assets/folders', null, 'AssetFolderListResponse', ['500']],
      ['POST', '/api/assets/folders', null, 'AssetFolder', ['500']],
      ['POST', '/api/assets/upload', null, 'UploadAssetResponse', ['400', '404', '409', '500']],
      ['DELETE', '/api/assets/upload', null, 'CancelAssetUploadResponse', ['400', '500']],
      ['GET', '/api/jobs', null, 'ListJobsResponse', ['500']],
      ['POST', '/api/jobs', 'CreateJobRequest', 'CreateJobResponse', ['400', '500']],
      ['GET', '/api/jobs/{jobId}', null, 'GetJobResponse', ['404', '500']],
      ['POST', '/api/jobs/{jobId}', 'TransitionJobRequest', 'TransitionJobResponse', ['400', '500']],
      ['GET', '/api/ledger', null, 'LedgerViewProjection', ['400', '500']],
      ['GET', '/api/canvases/{canvasId}', null, 'CanvasDetailResponse', ['404', '500']],
      ['POST', '/api/canvases/{canvasId}', 'MutationRequest', 'MutationResult', ['400', '404', '409', '500']],
      ['POST', '/api/compose', 'ComposeRequest', 'ComposeTaskResponse', ['400', '500']],
      ['GET', '/api/compose/{taskId}', null, 'ComposeTaskResponse', ['404', '500']],
      ['POST', '/api/compose/{taskId}', 'ComposeTaskAction', 'ComposeTaskResponse', ['400', '404', '500']],
    ]

    for (const [method, routePath, requestSchema, successSchema, errorStatuses] of contracts) {
      const operation = operationAt(document, method, routePath)
      expect(operation.tags?.length, `${method} ${routePath} tags`).toBeGreaterThan(0)
      expect(responseSchemaRef(operation, '200'), `${method} ${routePath} response`).toBe(
        `#/components/schemas/${successSchema}`,
      )
      expect(Object.keys(operation.responses ?? {}).filter((status) => status !== '200').sort()).toEqual(
        errorStatuses.slice().sort(),
      )
      if (requestSchema) {
        expect(operation.requestBody?.required, `${method} ${routePath} request required`).toBe(true)
        expect(operation.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
          `#/components/schemas/${requestSchema}`,
        )
      }
    }

    const upload = operationAt(document, 'POST', '/api/assets/upload')
    expect(upload.requestBody?.content?.['multipart/form-data']?.schema?.$ref).toBe(
      '#/components/schemas/UploadAssetRequest',
    )
    expect(document.components?.schemas?.UploadAssetRequest).toMatchObject({
      required: ['files'],
      properties: expect.objectContaining({
        files: expect.objectContaining({ items: expect.objectContaining({ format: 'binary' }) }),
        uploadToken: expect.any(Object),
      }),
    })
    expect(readFileSync(path.join(process.cwd(), 'docs/api/ASSET_INGESTION.md'), 'utf8')).toContain(
      'stage → persist staging row → content gate → commit',
    )
    expect(operationAt(document, 'DELETE', '/api/assets/upload').parameters).toEqual([
      expect.objectContaining({ name: 'token', in: 'query', required: true }),
    ])

    expect(operationAt(document, 'GET', '/api/ledger').parameters).toEqual([
      expect.objectContaining({
        name: 'limit',
        in: 'query',
        required: false,
        schema: expect.objectContaining({ type: 'integer', minimum: 1, maximum: 200 }),
      }),
    ])

    expect(responseSchemaRef(operationAt(document, 'GET', '/api/preview/character'), '200')).toBeUndefined()
    expect(operationAt(document, 'GET', '/api/preview/character').responses?.['200']?.content?.['image/svg+xml']?.schema).toEqual({
      type: 'string',
      format: 'binary',
    })
    expect(operationAt(document, 'GET', '/api/media/{path}').responses?.['200']?.content?.['*/*']?.schema).toEqual({
      type: 'string',
      format: 'binary',
    })
  })

  it('keeps every linked example local, readable and free of remote transport state', () => {
    const document = openApiDocument()
    expect(document.servers).toEqual([{ url: 'http://localhost:3200', description: 'Next.js 本地 mock server' }])
    expect(document['x-local-only']).toBe(true)
    expect(document['x-real-libtv-credentials']).toBe(false)
    expect(document['x-real-libtv-backend-call']).toBe(false)

    for (const [name, example] of Object.entries(document.components?.examples ?? {})) {
      if (example.externalValue) {
        const examplePath = path.resolve(process.cwd(), 'docs/api', example.externalValue)
        expect(examplePath, `${name} externalValue`).toMatch(/docs\/api\/examples\//)
        const contents = readFileSync(examplePath, 'utf8')
        expect(contents.length, `${name} readable`).toBeGreaterThan(0)
        expect(() => JSON.parse(contents), `${name} valid JSON`).not.toThrow()
      } else {
        expect(example.value, `${name} inline value`).toBeDefined()
      }
    }

    const serialised = JSON.stringify(document)
    expect(serialised).not.toMatch(/https:\/\/(?!localhost)/)
    expect(serialised).not.toMatch(/(?:Cookie|Authorization|access[_ -]?key|trace_id)\s*[:=]/i)
  })
})
