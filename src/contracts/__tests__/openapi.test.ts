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
import accessKeyActiveResponseExample from '../../../docs/api/examples/access-key-active.response.json'
import accessKeyCreateRequestExample from '../../../docs/api/examples/access-key-create.request.json'
import accessKeyCreateResponseExample from '../../../docs/api/examples/access-key-create.response.json'
import accessKeyRotateRequestExample from '../../../docs/api/examples/access-key-rotate.request.json'
import accessKeyRotateResponseExample from '../../../docs/api/examples/access-key-rotate.response.json'
import accessKeyRevokeRequestExample from '../../../docs/api/examples/access-key-revoke.request.json'
import accessKeyRevokeResponseExample from '../../../docs/api/examples/access-key-revoke.response.json'
import accessKeyCreateReplayResponseExample from '../../../docs/api/examples/access-key-create-replay.response.json'
import accessKeyInvalidInputErrorExample from '../../../docs/api/examples/access-key-invalid-input.error.response.json'
import accessKeyUnauthenticatedErrorExample from '../../../docs/api/examples/access-key-unauthenticated.error.response.json'
import accessKeyIdempotencyConflictErrorExample from '../../../docs/api/examples/access-key-idempotency-conflict.error.response.json'
import teamInviteRequestExample from '../../../docs/api/examples/team-invite.request.json'
import teamInviteResponseExample from '../../../docs/api/examples/team-invite.response.json'
import teamMemberUpdateRequestExample from '../../../docs/api/examples/team-member-update.request.json'
import teamMemberUpdateResponseExample from '../../../docs/api/examples/team-member-update.response.json'
import initialEngagementExample from '../../../docs/api/examples/showcase-engagement.initial.response.json'
import likeEngagementExample from '../../../docs/api/examples/showcase-engagement.like.response.json'
import likeEngagementRequestExample from '../../../docs/api/examples/showcase-engagement.request.json'
import assetLifecycleActiveExample from '../../../docs/api/examples/asset-lifecycle-active.response.json'
import assetLifecycleListActiveExample from '../../../docs/api/examples/asset-lifecycle-list-active.response.json'
import assetUpdateMetadataRequestExample from '../../../docs/api/examples/asset-update-metadata.request.json'
import assetDeleteRecoverableExample from '../../../docs/api/examples/asset-delete-recoverable.response.json'
import assetRegisterArtifactRequestExample from '../../../docs/api/examples/asset-register-artifact.request.json'
import assetRegisterArtifactMissingErrorExample from '../../../docs/api/examples/asset-register-artifact-missing.error.response.json'
import assetUploadSuccessExample from '../../../docs/api/examples/asset-upload-success.response.json'
import assetUploadEmptyFilesErrorExample from '../../../docs/api/examples/asset-upload-empty-files.error.response.json'
import assetUploadFolderNotFoundErrorExample from '../../../docs/api/examples/asset-upload-folder-not-found.error.response.json'
import assetUploadTokenConflictErrorExample from '../../../docs/api/examples/asset-upload-token-conflict.error.response.json'
import assetUploadCancelExample from '../../../docs/api/examples/asset-upload-cancel.response.json'
import assetUploadCancelReplayExample from '../../../docs/api/examples/asset-upload-cancel-replay.response.json'
import assetUploadInvalidTokenErrorExample from '../../../docs/api/examples/asset-upload-invalid-token.error.response.json'
import assetUpdateInvalidTagsErrorExample from '../../../docs/api/examples/asset-update-invalid-tags.error.response.json'
import assetNotFoundErrorExample from '../../../docs/api/examples/asset-not-found.error.response.json'
import assetRestoreNotRecoverableErrorExample from '../../../docs/api/examples/asset-restore-not-recoverable.error.response.json'
import assetDeletedErrorExample from '../../../docs/api/examples/asset-deleted.error.response.json'
import jobCreateRequestExample from '../../../docs/api/examples/jobs-create.request.json'
import jobCreateResponseExample from '../../../docs/api/examples/jobs-create.response.json'
import jobListResponseExample from '../../../docs/api/examples/jobs-list.response.json'
import jobGetResponseExample from '../../../docs/api/examples/jobs-get.response.json'
import jobTransitionConfirmRequestExample from '../../../docs/api/examples/jobs-transition.request.json'
import jobTransitionConfirmedResponseExample from '../../../docs/api/examples/jobs-transition.response.json'
import jobTransitionCancelRequestExample from '../../../docs/api/examples/jobs-transition-cancel.request.json'
import jobTransitionCancelledResponseExample from '../../../docs/api/examples/jobs-transition-cancel.response.json'
import jobTransitionCancelReplayResponseExample from '../../../docs/api/examples/jobs-transition-cancel-replay.response.json'
import jobCreateInvalidInputErrorExample from '../../../docs/api/examples/jobs-create-invalid-input.error.response.json'
import jobNotFoundErrorExample from '../../../docs/api/examples/jobs-not-found.error.response.json'
import jobTransitionInvalidActionErrorExample from '../../../docs/api/examples/jobs-transition-invalid-action.error.response.json'
import scriptQuoteInvalidInputErrorExample from '../../../docs/api/examples/script-v2-quote-invalid-input.error.response.json'
import scriptRunCreatedResponseExample from '../../../docs/api/examples/script-v2-run-created.response.json'
import scriptRunReplayResponseExample from '../../../docs/api/examples/script-v2-run-replay.response.json'
import scriptIdempotencyConflictErrorExample from '../../../docs/api/examples/script-v2-idempotency-conflict.error.response.json'
import scriptRunNotFoundErrorExample from '../../../docs/api/examples/script-v2-run-not-found.error.response.json'
import scriptTransitionCancelRequestExample from '../../../docs/api/examples/script-v2-transition-cancel.request.json'
import scriptRunCancelledResponseExample from '../../../docs/api/examples/script-v2-run-cancelled.response.json'
import scriptRunCancelReplayResponseExample from '../../../docs/api/examples/script-v2-run-cancel-replay.response.json'
import scriptTransitionRetryRequestExample from '../../../docs/api/examples/script-v2-transition-retry.request.json'
import scriptRunRetryResponseExample from '../../../docs/api/examples/script-v2-run-retry.response.json'
import scriptTransitionConflictErrorExample from '../../../docs/api/examples/script-v2-transition-conflict.error.response.json'
import scriptTransitionInvalidInputErrorExample from '../../../docs/api/examples/script-v2-transition-invalid-input.error.response.json'
import {
  CreateScriptV2RunRequestSchema,
  OfficialPromptRecomputeEnvelopeSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunResponseSchema,
  ScriptV2StateSchema,
  TransitionScriptV2RunRequestSchema,
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
import { LocalErrorEnvelopeSchema } from '@/contracts/http'
import {
  AssetLifecycleActionRequestSchema,
  AssetLifecycleListResponseSchema,
  AssetLifecycleViewSchema,
} from '@/contracts/assets'
import {
  CreateTeamInviteRequestSchema,
  CreateTeamInviteResponseSchema,
  TeamMemberUpdateResponseSchema,
  UpdateTeamMemberRequestSchema,
} from '@/contracts/team'
import {
  ShowcaseEngagementRequestSchema,
  ShowcaseEngagementResponseSchema,
} from '@/contracts/showcase'
import {
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  GetJobResponseSchema,
  ListJobsResponseSchema,
  TransitionJobRequestSchema,
  TransitionJobResponseSchema,
} from '@/contracts/jobs'

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
      examples?: Record<string, { $ref?: string; value?: unknown }>
    }>
  }
  parameters?: Array<{
    name?: string
    in?: string
    required?: boolean
    schema?: { type?: string; enum?: string[]; default?: unknown }
  }>
  responses?: Record<string, {
    content?: Record<string, {
      schema?: { $ref?: string; type?: string; format?: string; oneOf?: Array<{ $ref?: string }> }
      examples?: Record<string, { $ref?: string; value?: unknown }>
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

  it('derives the Route Coverage domain counts from the manifest', () => {
    const coverage = readFileSync(path.join(process.cwd(), 'docs/api/ROUTE_COVERAGE.md'), 'utf8')
    const groups = [
      {
        label: 'Project / Folder / Recycle Bin',
        includes: (route: (typeof LOCAL_API_ROUTES)[number]) =>
          route.tag === 'Projects' || route.tag === 'Folders' || route.tag === 'Recycle Bin',
      },
      {
        label: 'Jobs / Script V2 / compose',
        includes: (route: (typeof LOCAL_API_ROUTES)[number]) =>
          route.tag === 'Jobs' || route.tag === 'Script V2' || route.tag === 'Video',
      },
      {
        // Home discovery belongs in both the project-home and public-discovery
        // handoff domains, so it intentionally overlaps the first group.
        label: 'Public discovery / publish',
        includes: (route: (typeof LOCAL_API_ROUTES)[number]) =>
          route.path === '/api/home' || route.tag === 'Publish' || route.tag === 'Showcase',
      },
    ] as const

    for (const group of groups) {
      const routes = LOCAL_API_ROUTES.filter(group.includes)
      const paths = new Set(routes.map((route) => route.path)).size
      expect(coverage).toContain(`| ${group.label} | ${paths} / ${routes.length} |`)
    }
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

  it('documents body idempotency keys without inventing a global transport header', () => {
    const document = openApiDocument()
    const readme = readFileSync(path.join(process.cwd(), 'docs/api/README.md'), 'utf8')
    const bodyKeyOperations = [
      ['POST', '/api/access-key', '#/components/schemas/AccessKeyCommandRequest'],
      ['POST', '/api/team/invites', '#/components/schemas/CreateTeamInviteRequest'],
      ['PATCH', '/api/team/members/{memberId}', '#/components/schemas/UpdateTeamMemberRequest'],
    ] as const

    expect(readme).toContain('没有全局 `Idempotency-Key` header 约定')
    expect(readme).toContain('`idempotencyKey` 作为各 operation 的 JSON request body schema 必填字段')
    expect(readme).toContain('`Idempotency-Key` header，必须进行 versioned contract 迁移')
    expect(readme).not.toContain('header（例如 idempotency key）')

    for (const [method, routePath, schemaRef] of bodyKeyOperations) {
      const operation = operationAt(document, method, routePath)
      expect(operation.requestBody?.content?.['application/json']?.schema?.$ref).toBe(schemaRef)
      expect(operation.parameters?.some((parameter) => parameter.name?.toLowerCase() === 'idempotency-key') ?? false).toBe(false)
      const schemaName = schemaRef.replace('#/components/schemas/', '')
      expect(document.components?.schemas?.[schemaName]?.required).toContain('idempotencyKey')
    }

    const scriptRun = operationAt(document, 'POST', '/api/script-v2/runs')
    expect(scriptRun.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/CreateScriptV2RunRequest',
    )
    expect(scriptRun.parameters?.some((parameter) => parameter.name?.toLowerCase() === 'idempotency-key') ?? false).toBe(false)
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

  it('documents the stitch preview sequence switch with its runtime-tolerant query semantics', () => {
    const stitch = operationAt(openApiDocument(), 'GET', '/api/preview/stitch')
    const sequence = stitch.parameters?.find((parameter) => parameter.name === 'seq')

    expect(sequence).toMatchObject({ in: 'query', required: false, schema: { type: 'string', default: '0' } })
    expect(sequence?.schema?.enum).toBeUndefined()
  })

  it('provides executable Access Key lifecycle, replay and error examples without exposing a credential', () => {
    const document = openApiDocument()
    const accessKey = operationAt(document, 'GET', '/api/access-key')
    const accessKeyCommand = operationAt(document, 'POST', '/api/access-key')
    const handoffs = operationAt(document, 'GET', '/api/account/handoffs')

    const readyHandoffs = handoffs.responses?.['200']?.content?.['application/json']?.examples?.ready?.value

    expect(accessKey.responses?.['200']?.content?.['application/json']?.examples?.active?.$ref).toBe(
      '#/components/examples/AccessKeyActiveResponseExample',
    )
    expect(accessKeyCommand.requestBody?.content?.['application/json']?.examples).toMatchObject({
      create: { $ref: '#/components/examples/AccessKeyCreateRequestExample' },
      rotateAfterCreate: { $ref: '#/components/examples/AccessKeyRotateRequestExample' },
      revokeAfterRotate: { $ref: '#/components/examples/AccessKeyRevokeRequestExample' },
      createReplay: { $ref: '#/components/examples/AccessKeyCreateRequestExample' },
    })
    expect(accessKeyCommand.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      created: { $ref: '#/components/examples/AccessKeyCreateResponseExample' },
      rotatedAfterCreate: { $ref: '#/components/examples/AccessKeyRotateResponseExample' },
      revokedAfterRotate: { $ref: '#/components/examples/AccessKeyRevokeResponseExample' },
      createReplay: { $ref: '#/components/examples/AccessKeyCreateReplayResponseExample' },
    })
    expect(accessKeyCommand.responses?.['400']?.content?.['application/json']?.examples?.invalidAction?.$ref).toBe(
      '#/components/examples/AccessKeyInvalidInputErrorExample',
    )
    expect(accessKeyCommand.responses?.['401']?.content?.['application/json']?.examples?.anonymous?.$ref).toBe(
      '#/components/examples/AccessKeyUnauthenticatedErrorExample',
    )
    expect(accessKeyCommand.responses?.['409']?.content?.['application/json']?.examples?.idempotencyKeyReusedForAnotherAction?.$ref).toBe(
      '#/components/examples/AccessKeyIdempotencyConflictErrorExample',
    )

    expect(AccessKeyResponseSchema.parse(accessKeyActiveResponseExample)).toMatchObject({ key: { state: 'active', generation: 1 } })
    expect(AccessKeyCommandRequestSchema.parse(accessKeyCreateRequestExample)).toEqual({ action: 'create', idempotencyKey: 'access-key-create-example' })
    expect(AccessKeyResponseSchema.parse(accessKeyCreateResponseExample)).toMatchObject({ key: { state: 'active', generation: 1 } })
    expect(AccessKeyCommandRequestSchema.parse(accessKeyRotateRequestExample)).toEqual({ action: 'rotate', idempotencyKey: 'access-key-rotate-example' })
    expect(AccessKeyResponseSchema.parse(accessKeyRotateResponseExample)).toMatchObject({ key: { state: 'active', generation: 2 } })
    expect(AccessKeyCommandRequestSchema.parse(accessKeyRevokeRequestExample)).toEqual({ action: 'revoke', idempotencyKey: 'access-key-revoke-example' })
    expect(AccessKeyResponseSchema.parse(accessKeyRevokeResponseExample)).toMatchObject({ key: { state: 'revoked', generation: 2 } })
    expect(AccessKeyResponseSchema.parse(accessKeyCreateReplayResponseExample)).toEqual(accessKeyCreateResponseExample)
    expect(LocalErrorEnvelopeSchema.parse(accessKeyInvalidInputErrorExample)).toMatchObject({ error: { code: 'INVALID_INPUT' } })
    expect(LocalErrorEnvelopeSchema.parse(accessKeyUnauthenticatedErrorExample)).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(LocalErrorEnvelopeSchema.parse(accessKeyIdempotencyConflictErrorExample)).toMatchObject({ error: { code: 'REVISION_CONFLICT' } })
    expect(AccountExternalHandoffsResponseSchema.parse(readyHandoffs)).toMatchObject({
      state: 'ready',
      subscription: { action: 'open-subscription' },
    })
    for (const [name, filename] of Object.entries({
      AccessKeyActiveResponseExample: 'access-key-active.response.json',
      AccessKeyCreateRequestExample: 'access-key-create.request.json',
      AccessKeyCreateResponseExample: 'access-key-create.response.json',
      AccessKeyRotateRequestExample: 'access-key-rotate.request.json',
      AccessKeyRotateResponseExample: 'access-key-rotate.response.json',
      AccessKeyRevokeRequestExample: 'access-key-revoke.request.json',
      AccessKeyRevokeResponseExample: 'access-key-revoke.response.json',
      AccessKeyCreateReplayResponseExample: 'access-key-create-replay.response.json',
      AccessKeyInvalidInputErrorExample: 'access-key-invalid-input.error.response.json',
      AccessKeyUnauthenticatedErrorExample: 'access-key-unauthenticated.error.response.json',
      AccessKeyIdempotencyConflictErrorExample: 'access-key-idempotency-conflict.error.response.json',
    })) {
      expect(document.components?.examples?.[name]?.externalValue).toBe(`./examples/${filename}`)
    }
    expect(JSON.stringify({
      accessKeyActiveResponseExample,
      accessKeyCreateRequestExample,
      accessKeyCreateResponseExample,
      accessKeyRotateRequestExample,
      accessKeyRotateResponseExample,
      accessKeyRevokeRequestExample,
      accessKeyRevokeResponseExample,
      accessKeyCreateReplayResponseExample,
      accessKeyInvalidInputErrorExample,
      accessKeyUnauthenticatedErrorExample,
      accessKeyIdempotencyConflictErrorExample,
      readyHandoffs,
    })).not.toMatch(/(?:sk-|secret|token)/i)
  })

  it('keeps team command examples executable and connected to their OpenAPI operations', () => {
    const document = openApiDocument()
    const invite = operationAt(document, 'POST', '/api/team/invites')
    const member = operationAt(document, 'PATCH', '/api/team/members/{memberId}')

    expect(invite.requestBody?.content?.['application/json']?.examples?.createPendingInvite?.$ref).toBe(
      '#/components/examples/CreateTeamInviteRequestExample',
    )
    expect(invite.responses?.['200']?.content?.['application/json']?.examples?.pendingInvite?.$ref).toBe(
      '#/components/examples/CreateTeamInviteResponseExample',
    )
    expect(member.requestBody?.content?.['application/json']?.examples?.demoteAdminToMember?.$ref).toBe(
      '#/components/examples/UpdateTeamMemberRequestExample',
    )
    expect(member.responses?.['200']?.content?.['application/json']?.examples?.memberRoleUpdated?.$ref).toBe(
      '#/components/examples/TeamMemberUpdateResponseExample',
    )

    expect(document.components?.examples?.CreateTeamInviteRequestExample?.externalValue).toBe(
      './examples/team-invite.request.json',
    )
    expect(document.components?.examples?.CreateTeamInviteResponseExample?.externalValue).toBe(
      './examples/team-invite.response.json',
    )
    expect(document.components?.examples?.UpdateTeamMemberRequestExample?.externalValue).toBe(
      './examples/team-member-update.request.json',
    )
    expect(document.components?.examples?.TeamMemberUpdateResponseExample?.externalValue).toBe(
      './examples/team-member-update.response.json',
    )

    expect(CreateTeamInviteRequestSchema.parse(teamInviteRequestExample)).toEqual({
      inviteeAlias: '本地协作者',
      role: 'member',
      idempotencyKey: 'team-invite-example',
    })
    expect(CreateTeamInviteResponseSchema.parse(teamInviteResponseExample)).toMatchObject({
      invite: { id: 'invite_local_0001', state: 'pending' },
      team: { state: 'ready', team: { pendingInvites: [{ id: 'invite_local_0001' }] } },
    })
    expect(UpdateTeamMemberRequestSchema.parse(teamMemberUpdateRequestExample)).toEqual({
      role: 'member',
      idempotencyKey: 'team-member-role-example',
    })
    expect(TeamMemberUpdateResponseSchema.parse(teamMemberUpdateResponseExample)).toMatchObject({
      member: { id: 'member_liu', role: 'member' },
      team: { state: 'ready' },
    })
  })

  it('keeps asset lifecycle and upload examples executable without inventing request-level idempotency', () => {
    const document = openApiDocument()
    const update = operationAt(document, 'PATCH', '/api/assets/{assetId}')
    const remove = operationAt(document, 'DELETE', '/api/assets/{assetId}')
    const list = operationAt(document, 'GET', '/api/assets')
    const register = operationAt(document, 'POST', '/api/assets')
    const upload = operationAt(document, 'POST', '/api/assets/upload')
    const cancel = operationAt(document, 'DELETE', '/api/assets/upload')

    expect(update.requestBody?.content?.['application/json']?.examples).toMatchObject({
      metadata: { $ref: '#/components/examples/UpdateAssetMetadataRequestExample' },
      restore: { value: { action: 'restore' } },
    })
    expect(update.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      metadataUpdated: { $ref: '#/components/examples/AssetLifecycleActiveResponseExample' },
      restored: { $ref: '#/components/examples/AssetLifecycleActiveResponseExample' },
    })
    expect(update.responses?.['400']?.content?.['application/json']?.examples?.invalidTagList?.$ref).toBe(
      '#/components/examples/UpdateAssetInvalidTagsErrorExample',
    )
    expect(update.responses?.['404']?.content?.['application/json']?.examples?.assetMissing?.$ref).toBe(
      '#/components/examples/AssetNotFoundErrorExample',
    )
    expect(update.responses?.['409']?.content?.['application/json']?.examples?.restoreNotRecoverable?.$ref).toBe(
      '#/components/examples/AssetRestoreNotRecoverableErrorExample',
    )
    expect(update.responses?.['410']?.content?.['application/json']?.examples?.assetDeleted?.$ref).toBe(
      '#/components/examples/AssetDeletedErrorExample',
    )
    expect(remove.responses?.['200']?.content?.['application/json']?.examples?.softDeleted?.$ref).toBe(
      '#/components/examples/AssetDeleteRecoverableResponseExample',
    )
    expect(remove.responses?.['404']?.content?.['application/json']?.examples?.assetMissing?.$ref).toBe(
      '#/components/examples/AssetNotFoundErrorExample',
    )
    expect(list.responses?.['200']?.content?.['application/json']?.examples?.active?.$ref).toBe(
      '#/components/examples/AssetLifecycleListActiveResponseExample',
    )
    expect(register.requestBody?.content?.['application/json']?.examples).toMatchObject({
      existingArtifact: { $ref: '#/components/examples/RegisterAssetArtifactRequestExample' },
      replayExistingArtifact: { $ref: '#/components/examples/RegisterAssetArtifactRequestExample' },
    })
    expect(register.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      existingArtifact: { $ref: '#/components/examples/AssetLifecycleActiveResponseExample' },
      replayExistingArtifact: { $ref: '#/components/examples/AssetLifecycleActiveResponseExample' },
    })
    expect(register.responses?.['400']?.content?.['application/json']?.examples?.artifactMissing?.$ref).toBe(
      '#/components/examples/RegisterAssetArtifactMissingErrorExample',
    )
    expect(upload.responses?.['200']?.content?.['application/json']?.examples?.partialSuccess?.$ref).toBe(
      '#/components/examples/UploadAssetSuccessResponseExample',
    )
    expect(upload.responses?.['400']?.content?.['application/json']?.examples?.filesMissing?.$ref).toBe(
      '#/components/examples/UploadAssetEmptyFilesErrorExample',
    )
    expect(upload.responses?.['404']?.content?.['application/json']?.examples?.folderMissing?.$ref).toBe(
      '#/components/examples/UploadAssetFolderNotFoundErrorExample',
    )
    expect(upload.responses?.['409']?.content?.['application/json']?.examples?.tokenConflict?.$ref).toBe(
      '#/components/examples/UploadAssetTokenConflictErrorExample',
    )
    expect(cancel.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      cancelled: { $ref: '#/components/examples/CancelAssetUploadResponseExample' },
      replayAfterCancellation: { $ref: '#/components/examples/CancelAssetUploadReplayResponseExample' },
    })
    expect(cancel.responses?.['400']?.content?.['application/json']?.examples?.invalidToken?.$ref).toBe(
      '#/components/examples/CancelAssetUploadInvalidTokenErrorExample',
    )

    expect(AssetLifecycleViewSchema.parse(assetLifecycleActiveExample)).toMatchObject({
      id: 'asset_image_seed',
      state: 'committed',
      sourceArtifactId: 'art_image_seed',
      lifecycle: { availability: 'active', reason: 'available' },
    })
    expect(AssetLifecycleListResponseSchema.parse(assetLifecycleListActiveExample)).toEqual({
      assets: [assetLifecycleActiveExample],
    })
    expect(assetUpdateMetadataRequestExample).toEqual({
      name: '雨夜城市首帧（归档）',
      tags: ['场景', '风格'],
      folderId: 'afld_example_0001',
    })
    expect(AssetLifecycleActionRequestSchema.parse({ action: 'restore' })).toEqual({ action: 'restore' })
    expect(AssetLifecycleViewSchema.parse(assetDeleteRecoverableExample)).toMatchObject({
      state: 'revoked',
      lifecycle: { availability: 'recoverable', reason: 'deleted_by_user', recoverableUntil: null },
    })
    expect(assetRegisterArtifactRequestExample).toEqual({ artifactId: 'art_image_seed' })
    expect(assetLifecycleActiveExample).toEqual(
      AssetLifecycleViewSchema.parse(assetLifecycleActiveExample),
    )
    expect(assetUploadSuccessExample).toMatchObject({
      assets: [expect.objectContaining({
        id: 'ast_upload_example_01',
        state: 'committed',
        url: '/api/media/uploads/upl_example_01/first-frame.webp',
      })],
      rejected: [{ name: 'notes.txt', reason: '不接受的文件类型：text/plain' }],
    })
    expect(assetUploadCancelExample).toEqual({ revoked: 1 })
    expect(assetUploadCancelReplayExample).toEqual({ revoked: 0 })
    for (const [example, code, message, requestId] of [
      [assetRegisterArtifactMissingErrorExample, 'INVALID_INPUT', '产物不存在', 'req_local_gzjenq'],
      [assetUploadEmptyFilesErrorExample, 'INVALID_INPUT', '未选择文件', 'req_local_ipgz94'],
      [assetUploadFolderNotFoundErrorExample, 'NOT_FOUND', '文件夹不存在', 'req_local_xjr5ck'],
      [assetUploadTokenConflictErrorExample, 'REVISION_CONFLICT', '上传令牌冲突', 'req_local_1wxi8cp'],
      [assetUploadInvalidTokenErrorExample, 'INVALID_INPUT', '上传令牌不合法', 'req_local_1s4755n'],
      [assetUpdateInvalidTagsErrorExample, 'INVALID_INPUT', '标签需要是数组', 'req_local_1dkjtnq'],
      [assetNotFoundErrorExample, 'NOT_FOUND', '资产不存在', 'req_local_kdsoz1'],
      [assetRestoreNotRecoverableErrorExample, 'REVISION_CONFLICT', '该资产当前不可恢复', 'req_local_hzloyt'],
      [assetDeletedErrorExample, 'HTTP_ERROR', '资产已删除', 'req_local_1rnhjg5'],
    ] as const) {
      expect(LocalErrorEnvelopeSchema.parse(example)).toEqual({ error: { code, message }, requestId })
    }

    for (const [name, filename] of Object.entries({
      AssetLifecycleActiveResponseExample: 'asset-lifecycle-active.response.json',
      AssetLifecycleListActiveResponseExample: 'asset-lifecycle-list-active.response.json',
      UpdateAssetMetadataRequestExample: 'asset-update-metadata.request.json',
      AssetDeleteRecoverableResponseExample: 'asset-delete-recoverable.response.json',
      RegisterAssetArtifactRequestExample: 'asset-register-artifact.request.json',
      RegisterAssetArtifactMissingErrorExample: 'asset-register-artifact-missing.error.response.json',
      UploadAssetSuccessResponseExample: 'asset-upload-success.response.json',
      UploadAssetEmptyFilesErrorExample: 'asset-upload-empty-files.error.response.json',
      UploadAssetFolderNotFoundErrorExample: 'asset-upload-folder-not-found.error.response.json',
      UploadAssetTokenConflictErrorExample: 'asset-upload-token-conflict.error.response.json',
      CancelAssetUploadResponseExample: 'asset-upload-cancel.response.json',
      CancelAssetUploadReplayResponseExample: 'asset-upload-cancel-replay.response.json',
      CancelAssetUploadInvalidTokenErrorExample: 'asset-upload-invalid-token.error.response.json',
      UpdateAssetInvalidTagsErrorExample: 'asset-update-invalid-tags.error.response.json',
      AssetNotFoundErrorExample: 'asset-not-found.error.response.json',
      AssetRestoreNotRecoverableErrorExample: 'asset-restore-not-recoverable.error.response.json',
      AssetDeletedErrorExample: 'asset-deleted.error.response.json',
    })) {
      expect(document.components?.examples?.[name]?.externalValue).toBe(`./examples/${filename}`)
    }
  })

  it('keeps public TV Show engagement examples executable and connected to their OpenAPI operations', () => {
    const document = openApiDocument()
    const engagementRead = operationAt(document, 'GET', '/api/showcase/{snapshotId}/engagement')
    const engagementWrite = operationAt(document, 'POST', '/api/showcase/{snapshotId}/engagement')

    expect(engagementRead.responses?.['200']?.content?.['application/json']?.examples?.initialViewerState?.$ref).toBe(
      '#/components/examples/ShowcaseEngagementInitialResponseExample',
    )
    expect(engagementWrite.requestBody?.content?.['application/json']?.examples?.like?.$ref).toBe(
      '#/components/examples/ShowcaseEngagementRequestExample',
    )
    expect(engagementWrite.responses?.['200']?.content?.['application/json']?.examples?.liked?.$ref).toBe(
      '#/components/examples/ShowcaseEngagementLikeResponseExample',
    )
    expect(document.components?.examples?.ShowcaseEngagementInitialResponseExample?.externalValue).toBe(
      './examples/showcase-engagement.initial.response.json',
    )
    expect(document.components?.examples?.ShowcaseEngagementRequestExample?.externalValue).toBe(
      './examples/showcase-engagement.request.json',
    )
    expect(document.components?.examples?.ShowcaseEngagementLikeResponseExample?.externalValue).toBe(
      './examples/showcase-engagement.like.response.json',
    )

    expect(ShowcaseEngagementRequestSchema.parse(likeEngagementRequestExample)).toEqual({ action: 'like' })
    expect(ShowcaseEngagementResponseSchema.parse(initialEngagementExample)).toMatchObject({
      liked: false,
      likeCount: 12,
      shareCount: 0,
    })
    expect(ShowcaseEngagementResponseSchema.parse(likeEngagementExample)).toMatchObject({
      liked: true,
      likeCount: 13,
      shareCount: 0,
    })
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

  it('keeps Jobs and Script V2 lifecycle examples schema-valid, file-backed and attached to their state-machine outcomes', () => {
    const document = openApiDocument()
    const jobs = operationAt(document, 'POST', '/api/jobs')
    const jobDetail = operationAt(document, 'POST', '/api/jobs/{jobId}')
    const jobRead = operationAt(document, 'GET', '/api/jobs/{jobId}')
    const jobList = operationAt(document, 'GET', '/api/jobs')

    expect(jobs.requestBody?.content?.['application/json']?.examples?.create?.$ref).toBe(
      '#/components/examples/JobsCreateRequestFileExample',
    )
    expect(jobs.responses?.['200']?.content?.['application/json']?.examples?.awaitingConfirmation?.$ref).toBe(
      '#/components/examples/JobsCreateResponseFileExample',
    )
    expect(jobs.responses?.['400']?.content?.['application/json']?.examples?.invalidNode?.$ref).toBe(
      '#/components/examples/JobsCreateInvalidInputErrorExample',
    )
    expect(jobList.responses?.['200']?.content?.['application/json']?.examples?.history?.$ref).toBe(
      '#/components/examples/JobsListResponseFileExample',
    )
    expect(jobRead.responses?.['200']?.content?.['application/json']?.examples?.running?.$ref).toBe(
      '#/components/examples/JobsGetResponseFileExample',
    )
    expect(jobRead.responses?.['404']?.content?.['application/json']?.examples?.jobMissing?.$ref).toBe(
      '#/components/examples/JobsNotFoundErrorExample',
    )
    expect(jobDetail.requestBody?.content?.['application/json']?.examples).toMatchObject({
      confirm: { $ref: '#/components/examples/JobsTransitionConfirmRequestFileExample' },
      cancel: { $ref: '#/components/examples/JobsTransitionCancelRequestExample' },
      cancelReplay: { $ref: '#/components/examples/JobsTransitionCancelRequestExample' },
    })
    expect(jobDetail.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      confirmed: { $ref: '#/components/examples/JobsTransitionConfirmedResponseFileExample' },
      cancelled: { $ref: '#/components/examples/JobsTransitionCancelledResponseExample' },
      cancelReplay: { $ref: '#/components/examples/JobsTransitionCancelReplayResponseExample' },
    })
    expect(jobDetail.responses?.['400']?.content?.['application/json']?.examples?.invalidAction?.$ref).toBe(
      '#/components/examples/JobsTransitionInvalidActionErrorExample',
    )

    expect(CreateJobRequestSchema.parse(jobCreateRequestExample)).toEqual(jobCreateRequestExample)
    expect(CreateJobResponseSchema.parse(jobCreateResponseExample)).toEqual(jobCreateResponseExample)
    expect(ListJobsResponseSchema.parse(jobListResponseExample)).toEqual(jobListResponseExample)
    expect(GetJobResponseSchema.parse(jobGetResponseExample)).toEqual(jobGetResponseExample)
    expect(TransitionJobRequestSchema.parse(jobTransitionConfirmRequestExample)).toEqual(jobTransitionConfirmRequestExample)
    expect(TransitionJobResponseSchema.parse(jobTransitionConfirmedResponseExample)).toEqual(jobTransitionConfirmedResponseExample)
    expect(TransitionJobRequestSchema.parse(jobTransitionCancelRequestExample)).toEqual({ action: 'cancel' })
    expect(TransitionJobResponseSchema.parse(jobTransitionCancelledResponseExample)).toMatchObject({
      job: { status: 'cancelled', finishedAt: expect.any(String) },
    })
    expect(jobTransitionCancelReplayResponseExample).toEqual(jobTransitionCancelledResponseExample)
    for (const [example, code] of [
      [jobCreateInvalidInputErrorExample, 'INVALID_INPUT'],
      [jobNotFoundErrorExample, 'NOT_FOUND'],
      [jobTransitionInvalidActionErrorExample, 'INVALID_INPUT'],
    ] as const) {
      expect(LocalErrorEnvelopeSchema.parse(example)).toMatchObject({ error: { code } })
    }

    const quote = operationAt(document, 'POST', '/api/script-v2/quotes')
    const runs = operationAt(document, 'POST', '/api/script-v2/runs')
    const runRead = operationAt(document, 'GET', '/api/script-v2/runs/{runId}')
    const runTransition = operationAt(document, 'POST', '/api/script-v2/runs/{runId}')
    expect(quote.responses?.['422']?.content?.['application/json']?.examples?.invalidQuoteInput?.$ref).toBe(
      '#/components/examples/ScriptV2QuoteInvalidInputErrorExample',
    )
    expect(runs.requestBody?.content?.['application/json']?.examples).toMatchObject({
      createAsset: { $ref: '#/components/examples/CreateScriptV2RunRequestExample' },
      idempotentReplay: { $ref: '#/components/examples/CreateScriptV2RunRequestExample' },
    })
    expect(runs.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      queued: { $ref: '#/components/examples/ScriptV2RunCreatedResponseExample' },
      idempotentReplay: { $ref: '#/components/examples/ScriptV2RunReplayResponseExample' },
    })
    expect(runs.responses?.['409']?.content?.['application/json']?.examples?.idempotencyKeyPayloadDrift?.$ref).toBe(
      '#/components/examples/ScriptV2IdempotencyConflictErrorExample',
    )
    expect(runRead.responses?.['404']?.content?.['application/json']?.examples?.runMissing?.$ref).toBe(
      '#/components/examples/ScriptV2RunNotFoundErrorExample',
    )
    expect(runTransition.requestBody?.content?.['application/json']?.examples).toMatchObject({
      cancel: { $ref: '#/components/examples/ScriptV2TransitionCancelRequestExample' },
      cancelReplay: { $ref: '#/components/examples/ScriptV2TransitionCancelRequestExample' },
      retryAfterCancellation: { $ref: '#/components/examples/ScriptV2TransitionRetryRequestExample' },
    })
    expect(runTransition.responses?.['200']?.content?.['application/json']?.examples).toMatchObject({
      cancelled: { $ref: '#/components/examples/ScriptV2RunCancelledResponseExample' },
      cancelReplay: { $ref: '#/components/examples/ScriptV2RunCancelReplayResponseExample' },
      retryQueued: { $ref: '#/components/examples/ScriptV2RunRetryResponseExample' },
    })
    expect(runTransition.responses?.['409']?.content?.['application/json']?.examples?.terminalTransitionConflict?.$ref).toBe(
      '#/components/examples/ScriptV2TransitionConflictErrorExample',
    )
    expect(runTransition.responses?.['422']?.content?.['application/json']?.examples?.invalidTransitionInput?.$ref).toBe(
      '#/components/examples/ScriptV2TransitionInvalidInputErrorExample',
    )

    expect(ScriptV2RunResponseSchema.parse(scriptRunCreatedResponseExample)).toMatchObject({
      run: { status: 'queued', attempt: 1, progress: 0, result: null },
    })
    expect(scriptRunReplayResponseExample).toEqual(scriptRunCreatedResponseExample)
    expect(TransitionScriptV2RunRequestSchema.parse(scriptTransitionCancelRequestExample)).toEqual({ action: 'cancel' })
    expect(ScriptV2RunResponseSchema.parse(scriptRunCancelledResponseExample)).toMatchObject({
      run: { status: 'cancelled', attempt: 1, result: null },
    })
    expect(scriptRunCancelReplayResponseExample).toEqual(scriptRunCancelledResponseExample)
    expect(TransitionScriptV2RunRequestSchema.parse(scriptTransitionRetryRequestExample)).toEqual({ action: 'retry' })
    expect(ScriptV2RunResponseSchema.parse(scriptRunRetryResponseExample)).toMatchObject({
      run: { status: 'queued', attempt: 2, progress: 0, result: null },
    })
    for (const [example, code] of [
      [scriptQuoteInvalidInputErrorExample, 'INVALID_INPUT'],
      [scriptIdempotencyConflictErrorExample, 'REVISION_CONFLICT'],
      [scriptRunNotFoundErrorExample, 'NOT_FOUND'],
      [scriptTransitionConflictErrorExample, 'REVISION_CONFLICT'],
      [scriptTransitionInvalidInputErrorExample, 'INVALID_INPUT'],
    ] as const) {
      expect(LocalErrorEnvelopeSchema.parse(example)).toMatchObject({ error: { code } })
    }

    const paths = {
      JobsCreateRequestFileExample: 'jobs-create.request.json',
      JobsCreateResponseFileExample: 'jobs-create.response.json',
      JobsListResponseFileExample: 'jobs-list.response.json',
      JobsGetResponseFileExample: 'jobs-get.response.json',
      JobsTransitionConfirmRequestFileExample: 'jobs-transition.request.json',
      JobsTransitionConfirmedResponseFileExample: 'jobs-transition.response.json',
      JobsTransitionCancelRequestExample: 'jobs-transition-cancel.request.json',
      JobsTransitionCancelledResponseExample: 'jobs-transition-cancel.response.json',
      JobsTransitionCancelReplayResponseExample: 'jobs-transition-cancel-replay.response.json',
      JobsCreateInvalidInputErrorExample: 'jobs-create-invalid-input.error.response.json',
      JobsNotFoundErrorExample: 'jobs-not-found.error.response.json',
      JobsTransitionInvalidActionErrorExample: 'jobs-transition-invalid-action.error.response.json',
      ScriptV2QuoteInvalidInputErrorExample: 'script-v2-quote-invalid-input.error.response.json',
      ScriptV2RunCreatedResponseExample: 'script-v2-run-created.response.json',
      ScriptV2RunReplayResponseExample: 'script-v2-run-replay.response.json',
      ScriptV2IdempotencyConflictErrorExample: 'script-v2-idempotency-conflict.error.response.json',
      ScriptV2RunNotFoundErrorExample: 'script-v2-run-not-found.error.response.json',
      ScriptV2TransitionCancelRequestExample: 'script-v2-transition-cancel.request.json',
      ScriptV2RunCancelledResponseExample: 'script-v2-run-cancelled.response.json',
      ScriptV2RunCancelReplayResponseExample: 'script-v2-run-cancel-replay.response.json',
      ScriptV2TransitionRetryRequestExample: 'script-v2-transition-retry.request.json',
      ScriptV2RunRetryResponseExample: 'script-v2-run-retry.response.json',
      ScriptV2TransitionConflictErrorExample: 'script-v2-transition-conflict.error.response.json',
      ScriptV2TransitionInvalidInputErrorExample: 'script-v2-transition-invalid-input.error.response.json',
    } as const
    for (const [name, filename] of Object.entries(paths)) {
      expect(document.components?.examples?.[name]?.externalValue).toBe(`./examples/${filename}`)
    }
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
