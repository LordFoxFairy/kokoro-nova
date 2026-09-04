'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { client } from '@/api/client'
import type {
  CreateScriptV2RunRequest,
  ScriptV2QuoteRequest,
  ScriptV2QuoteResponse,
  ScriptV2Run,
  ScriptV2RunResponse,
  TransitionScriptV2RunRequest,
} from '@/contracts/script-v2'
import {
  SCRIPT_V2_RECOMPUTE_MAX_SHOTS,
  resolveScriptV2PromptWriteback,
  scriptV2PromptInputFingerprint,
  type ScriptV2Asset,
  type ScriptV2PromptBatchRun,
  type ScriptV2PromptRequestContext,
  type ScriptV2State,
} from '@/domain/script-v2'

const POLL_INTERVAL_MS = 400
const FIXTURE_TIMESTAMP = '2026-09-04T00:00:00.000Z'

export interface ScriptV2RunApi {
  quote(
    input: ScriptV2QuoteRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ScriptV2QuoteResponse>
  createRun(
    input: CreateScriptV2RunRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ScriptV2RunResponse>
  getRun(runId: string, options?: { signal?: AbortSignal }): Promise<ScriptV2RunResponse>
  transitionRun(
    runId: string,
    action: TransitionScriptV2RunRequest['action'],
    options?: { signal?: AbortSignal },
  ): Promise<ScriptV2RunResponse>
}

export interface ScriptV2RunControllerOptions {
  canvasId: string
  nodeId: string
  getState(): ScriptV2State
  onStateChange(state: ScriptV2State): void
  api?: ScriptV2RunApi
  flushPendingPromptEdits?(): void | Promise<void>
  onRunChange?(run: ScriptV2Run | null): void
  onProgressChange?(progressByRowId: Record<string, number>): void
  pollIntervalMs?: number
}

export interface GenerateScriptV2Input {
  storyText: string
  entry: 'screenplay' | 'character'
  modelId: string
  character?: {
    name: string
    description: string
    premise: string
  }
}

export interface ScriptV2RunController {
  generateScript(input: GenerateScriptV2Input): Promise<ScriptV2Run>
  recognizeAssets(): Promise<ScriptV2Run>
  recomputePrompts(rowIds: string[]): Promise<ScriptV2Run[]>
  generateAssets(assetIds: string[]): Promise<ScriptV2Run[]>
  cancelRun(): Promise<ScriptV2Run | null>
  getActiveRun(): ScriptV2Run | null
  getProgressByRowId(): Record<string, number>
  dispose(): void
}

function abortError(): Error {
  const error = new Error('Script V2 operation aborted')
  error.name = 'AbortError'
  return error
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function allAssets(state: ScriptV2State): ScriptV2Asset[] {
  return [...state.assets.characters, ...state.assets.scenes, ...state.assets.props]
}

function replaceAsset(state: ScriptV2State, replacement: ScriptV2Asset): ScriptV2State {
  const replace = (assets: ScriptV2Asset[]) =>
    assets.map((asset) => (asset.id === replacement.id ? replacement : asset))
  return {
    ...state,
    assets: {
      characters: replace(state.assets.characters),
      scenes: replace(state.assets.scenes),
      props: replace(state.assets.props),
    },
  }
}

export function createScriptV2RunController(
  options: ScriptV2RunControllerOptions,
): ScriptV2RunController {
  const api = options.api ?? client.scriptV2
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const latestOperationIds: Record<string, string | undefined> = {}
  let activeAbort: AbortController | null = null
  let activeRun: ScriptV2Run | null = null
  let operationOrdinal = 0
  let disposed = false
  let progressByRowId: Record<string, number> = {}

  const emitRun = (run: ScriptV2Run | null) => {
    activeRun = run ? structuredClone(run) : null
    options.onRunChange?.(activeRun ? structuredClone(activeRun) : null)
  }

  const emitProgress = (rowIds: string[], progress: number) => {
    progressByRowId = {
      ...progressByRowId,
      ...Object.fromEntries(rowIds.map((rowId) => [rowId, progress])),
    }
    options.onProgressChange?.({ ...progressByRowId })
  }

  const commitState = (state: ScriptV2State) => {
    if (!disposed) options.onStateChange(state)
  }

  const delay = (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted || disposed) {
        reject(abortError())
        return
      }
      const timer = setTimeout(() => {
        timers.delete(timer)
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, pollIntervalMs)
      const onAbort = () => {
        clearTimeout(timer)
        timers.delete(timer)
        signal.removeEventListener('abort', onAbort)
        reject(abortError())
      }
      timers.add(timer)
      signal.addEventListener('abort', onAbort, { once: true })
    })

  const begin = () => {
    if (disposed) throw abortError()
    activeAbort?.abort()
    activeAbort = new AbortController()
    return activeAbort
  }

  const idempotencyKey = (kind: string, identity: string) => {
    operationOrdinal += 1
    return `script_${fnv1a(`${options.nodeId}:${kind}:${identity}:${operationOrdinal}`)}`
  }

  const poll = async (
    response: ScriptV2RunResponse,
    rowIds: string[],
    signal: AbortSignal,
  ): Promise<ScriptV2Run> => {
    let run = response.run
    emitRun(run)
    emitProgress(rowIds, run.progress)
    while (run.status === 'queued' || run.status === 'running') {
      await delay(signal)
      if (signal.aborted || disposed) throw abortError()
      run = (await api.getRun(run.id, { signal })).run
      emitRun(run)
      emitProgress(rowIds, run.progress)
    }
    if (run.status === 'failed') throw new Error(run.error ?? 'Script V2 任务失败')
    if (run.status === 'cancelled') throw abortError()
    return run
  }

  const finish = (controller: AbortController) => {
    if (activeAbort === controller) {
      activeAbort = null
      emitRun(null)
    }
  }

  const updateBatchRun = (
    batchRunId: string,
    update: (run: ScriptV2PromptBatchRun) => ScriptV2PromptBatchRun,
  ) => {
    const state = options.getState()
    commitState({
      ...state,
      promptBatchRuns: state.promptBatchRuns.map((run) =>
        run.runId === batchRunId ? update(run) : run,
      ),
    })
  }

  const controller: ScriptV2RunController = {
    async generateScript(input) {
      const operation = begin()
      try {
        const response = await api.createRun(
          {
            idempotencyKey: idempotencyKey('generate-full', input.storyText),
            canvasId: options.canvasId,
            nodeId: options.nodeId,
            operation: 'generate-full',
            input,
          },
          { signal: operation.signal },
        )
        const run = await poll(response, [], operation.signal)
        if (run.operation !== 'generate-full' || !run.result) {
          throw new Error('Script V2 脚本生成结果与 operation 不匹配')
        }
        const state = options.getState()
        commitState({
          ...state,
          entry: input.entry,
          activeStage: 'shots',
          title: run.result.title,
          originalStoryText: input.storyText,
          styleDescription: run.result.styleDescription ?? null,
          rows: run.result.rows,
          assets: run.result.assets,
          generator: {
            ...state.generator,
            modelId: input.modelId,
            prompt: input.storyText,
            status: 'idle',
            error: null,
          },
          nextRowOrdinal: run.result.rows.length + 1,
          nextAssetOrdinal:
            run.result.assets.characters.length +
            run.result.assets.scenes.length +
            run.result.assets.props.length +
            1,
        })
        return run
      } finally {
        finish(operation)
      }
    },

    async recognizeAssets() {
      const operation = begin()
      try {
        const state = options.getState()
        const response = await api.createRun(
          {
            idempotencyKey: idempotencyKey('recognize-assets-only', state.originalStoryText),
            canvasId: options.canvasId,
            nodeId: options.nodeId,
            operation: 'recognize-assets-only',
            input: { state },
          },
          { signal: operation.signal },
        )
        const run = await poll(response, state.rows.map((row) => row.id), operation.signal)
        if (run.operation !== 'recognize-assets-only' || !run.result) {
          throw new Error('Script V2 资产识别结果与 operation 不匹配')
        }
        commitState({ ...options.getState(), assets: run.result.assets })
        return run
      } finally {
        finish(operation)
      }
    },

    async recomputePrompts(rowIds) {
      const operation = begin()
      const runId = `prompt_batch_${fnv1a(`${options.nodeId}:${rowIds.join(',')}:${operationOrdinal + 1}`)}`
      const validIds = [...new Set(rowIds)].filter((rowId) =>
        options.getState().rows.some((row) => row.id === rowId),
      )
      if (!validIds.length) {
        finish(operation)
        throw new Error('提示词重算至少需要一个有效镜头')
      }
      await options.flushPendingPromptEdits?.()
      const groups = chunks(validIds, SCRIPT_V2_RECOMPUTE_MAX_SHOTS)
      const initialRun: ScriptV2PromptBatchRun = {
        runId,
        status: 'running',
        targetShotIds: validIds,
        batchSize: SCRIPT_V2_RECOMPUTE_MAX_SHOTS,
        batches: groups.map((shotIds, index) => ({
          batchId: `${runId}_${index + 1}`,
          shotIds,
          status: 'pending',
        })),
        createdAt: FIXTURE_TIMESTAMP,
        updatedAt: FIXTURE_TIMESTAMP,
      }
      commitState({
        ...options.getState(),
        promptBatchRuns: [...options.getState().promptBatchRuns, initialRun],
      })

      const completed: ScriptV2Run[] = []
      try {
        for (const [index, shotIds] of groups.entries()) {
          if (operation.signal.aborted || disposed) throw abortError()
          const state = options.getState()
          const requestContexts: ScriptV2PromptRequestContext[] = shotIds.flatMap((shotId) => {
            const row = state.rows.find((candidate) => candidate.id === shotId)
            if (!row) return []
            return (['image', 'video'] as const).map((track) => {
              const operationId = `${runId}:${index + 1}:${shotId}:${track}`
              latestOperationIds[`${shotId}:${track}`] = operationId
              return {
                shotId,
                track,
                operationId,
                requestInputFingerprint: scriptV2PromptInputFingerprint(
                  row,
                  track,
                  state.assets,
                  state.styleDescription,
                ),
              }
            })
          })
          const contextByShot = new Set(requestContexts.map((context) => context.shotId))
          commitState({
            ...state,
            rows: state.rows.map((row) =>
              contextByShot.has(row.id)
                ? {
                    ...row,
                    imagePromptState:
                      row.imagePromptState === 'user_edited' ||
                      row.imagePromptState === 'user_edited_stale'
                        ? row.imagePromptState
                        : 'generating',
                    videoPromptState:
                      row.videoPromptState === 'user_edited' ||
                      row.videoPromptState === 'user_edited_stale'
                        ? row.videoPromptState
                        : 'generating',
                  }
                : row,
            ),
          })
          updateBatchRun(runId, (run) => ({
            ...run,
            batches: run.batches.map((batch, batchIndex) =>
              batchIndex === index
                ? { ...batch, status: 'submitting', requestContexts }
                : batch,
            ),
          }))

          const requestState = options.getState()
          const response = await api.createRun(
            {
              idempotencyKey: idempotencyKey('recompute-prompts', shotIds.join(',')),
              canvasId: options.canvasId,
              nodeId: options.nodeId,
              operation: 'recompute-prompts',
              input: { state: requestState, rowIds: shotIds },
            },
            { signal: operation.signal },
          )
          updateBatchRun(runId, (run) => ({
            ...run,
            batches: run.batches.map((batch, batchIndex) =>
              batchIndex === index
                ? { ...batch, status: 'running', taskId: response.run.id }
                : batch,
            ),
          }))
          const finished = await poll(response, shotIds, operation.signal)
          if (finished.operation !== 'recompute-prompts' || !finished.result) {
            throw new Error('Script V2 提示词结果与 operation 不匹配')
          }

          const current = options.getState()
          for (const row of current.rows) {
            if (!contextByShot.has(row.id)) continue
            if (
              row.imagePromptState === 'user_edited' ||
              row.imagePromptState === 'user_edited_stale'
            ) {
              delete latestOperationIds[`${row.id}:image`]
            }
            if (
              row.videoPromptState === 'user_edited' ||
              row.videoPromptState === 'user_edited_stale'
            ) {
              delete latestOperationIds[`${row.id}:video`]
            }
          }
          commitState(
            resolveScriptV2PromptWriteback({
              state: current,
              result: finished.result,
              requestContexts,
              latestOperationIds,
            }),
          )
          updateBatchRun(runId, (run) => ({
            ...run,
            batches: run.batches.map((batch, batchIndex) =>
              batchIndex === index ? { ...batch, status: 'succeeded' } : batch,
            ),
          }))
          completed.push(finished)
        }
        updateBatchRun(runId, (run) => ({ ...run, status: 'completed' }))
        return completed
      } catch (error) {
        if (!disposed) {
          updateBatchRun(runId, (run) => ({
            ...run,
            status: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed',
            batches: run.batches.map((batch) =>
              batch.status === 'running' || batch.status === 'submitting'
                ? {
                    ...batch,
                    status:
                      error instanceof Error && error.name === 'AbortError'
                        ? 'cancelled'
                        : 'failed',
                    error: error instanceof Error ? error.message : String(error),
                  }
                : batch,
            ),
          }))
        }
        throw error
      } finally {
        finish(operation)
      }
    },

    async generateAssets(assetIds) {
      const operation = begin()
      const results: ScriptV2Run[] = []
      try {
        for (const assetId of [...new Set(assetIds)]) {
          const state = options.getState()
          const asset = allAssets(state).find((candidate) => candidate.id === assetId)
          if (!asset) continue
          const settings = asset.generation ?? {
            modelId: 'lib-image-2',
            prompt: asset.description || asset.name,
            quality: 'standard' as const,
            resolution: '2K' as const,
            aspectRatio: '2:1',
          }
          const response = await api.createRun(
            {
              idempotencyKey: idempotencyKey('generate-asset', asset.id),
              canvasId: options.canvasId,
              nodeId: options.nodeId,
              operation: 'generate-asset',
              input: { asset, settings },
            },
            { signal: operation.signal },
          )
          const finished = await poll(response, [], operation.signal)
          if (finished.operation !== 'generate-asset' || !finished.result) {
            throw new Error('Script V2 资产生成结果与 operation 不匹配')
          }
          commitState(replaceAsset(options.getState(), finished.result.asset))
          results.push(finished)
        }
        return results
      } finally {
        finish(operation)
      }
    },

    async cancelRun() {
      const run = activeRun
      if (!run) return null
      activeAbort?.abort()
      const response = await api.transitionRun(run.id, 'cancel')
      emitRun(response.run)
      return response.run
    },

    getActiveRun() {
      return activeRun ? structuredClone(activeRun) : null
    },

    getProgressByRowId() {
      return { ...progressByRowId }
    },

    dispose() {
      disposed = true
      activeAbort?.abort()
      activeAbort = null
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      activeRun = null
    },
  }

  return controller
}

export interface UseScriptV2RunsOptions {
  canvasId?: string
  nodeId: string
  state: ScriptV2State
  onStateChange(state: ScriptV2State): void
  flushPendingPromptEdits?(): void | Promise<void>
}

export function useScriptV2Runs(options: UseScriptV2RunsOptions) {
  const stateRef = useRef(options.state)
  const callbackRef = useRef(options.onStateChange)
  const flushRef = useRef(options.flushPendingPromptEdits)
  stateRef.current = options.state
  callbackRef.current = options.onStateChange
  flushRef.current = options.flushPendingPromptEdits
  const [activeRun, setActiveRun] = useState<ScriptV2Run | null>(null)
  const [progressByRowId, setProgressByRowId] = useState<Record<string, number>>({})

  const controller = useMemo(
    () =>
      createScriptV2RunController({
        canvasId: options.canvasId ?? 'canvas_local',
        nodeId: options.nodeId,
        getState: () => stateRef.current,
        onStateChange: (state) => {
          stateRef.current = state
          callbackRef.current(state)
        },
        flushPendingPromptEdits: () => flushRef.current?.(),
        onRunChange: setActiveRun,
        onProgressChange: setProgressByRowId,
      }),
    [options.canvasId, options.nodeId],
  )

  const activeControllerRef = useRef(controller)
  const mountedRef = useRef(false)
  useEffect(() => {
    const previous = activeControllerRef.current
    activeControllerRef.current = controller
    if (previous !== controller) previous.dispose()
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // React development Strict Mode performs setup → cleanup → setup for
      // effects. Deferring the irreversible dispose lets that second setup
      // keep this controller alive, while a real unmount still cleans it up.
      queueMicrotask(() => {
        if (!mountedRef.current && activeControllerRef.current === controller) {
          controller.dispose()
        }
      })
    }
  }, [controller])

  return {
    activeRun,
    progressByRowId,
    isRunning: activeRun?.status === 'queued' || activeRun?.status === 'running',
    generateScript: controller.generateScript,
    recognizeAssets: controller.recognizeAssets,
    recomputePrompts: controller.recomputePrompts,
    generateAssets: controller.generateAssets,
    cancelRun: controller.cancelRun,
  }
}
