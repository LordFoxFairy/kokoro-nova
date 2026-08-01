import type { Artifact, ExecutionSpec } from '@/domain/types'

/**
 * Provider port.
 *
 * This is the seam the integration team plugs real model backends into. The
 * rest of the platform only knows this interface, so adding a provider never
 * requires touching the canvas, storyboard, ledger or agent code.
 *
 * Contract:
 *  - `submit` must be idempotent on `invocationId`. If the same invocation is
 *    submitted twice, return the existing handle instead of starting new work.
 *  - `poll` must be safe to call repeatedly and must never mutate billing.
 *  - `cancel` is best-effort; a late success after cancel is expected and is
 *    resolved by the job runner, not by the provider.
 */
export interface GenerationProvider {
  readonly id: string
  /** Model ids this provider claims. */
  supports(modelId: string): boolean
  submit(request: ProviderSubmitRequest): Promise<ProviderHandle>
  poll(handle: ProviderHandle): Promise<ProviderStatus>
  cancel(handle: ProviderHandle): Promise<void>
}

export interface ProviderSubmitRequest {
  /** Stable logical side-effect id, constant across infra attempts. */
  invocationId: string
  spec: ExecutionSpec
  /** Where the provider should write artifacts. */
  workspaceDir: string
  /** Public URL prefix that maps to `workspaceDir`. */
  publicPrefix: string
}

export interface ProviderHandle {
  providerId: string
  invocationId: string
  remoteJobId: string
}

export type ProviderStatus =
  | { state: 'running'; progress: number }
  | { state: 'succeeded'; artifacts: Omit<Artifact, 'id' | 'jobId' | 'assetId' | 'createdAt'>[] }
  | { state: 'failed'; error: string }
  | { state: 'cancelled' }
  | { state: 'compliance_blocked'; error: string }

const registry: GenerationProvider[] = []

export function registerProvider(provider: GenerationProvider) {
  const index = registry.findIndex((p) => p.id === provider.id)
  if (index >= 0) registry.splice(index, 1, provider)
  else registry.push(provider)
}

export function providerFor(modelId: string): GenerationProvider {
  // Later registrations win, so an integrator can shadow the built-in mock by
  // registering a real provider that claims the same model ids.
  for (let i = registry.length - 1; i >= 0; i -= 1) {
    if (registry[i].supports(modelId)) return registry[i]
  }
  throw new Error(`没有已注册的 provider 支持模型 ${modelId}`)
}

export function listProviders(): readonly GenerationProvider[] {
  return registry
}
