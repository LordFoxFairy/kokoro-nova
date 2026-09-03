import { describe, expect, it } from 'vitest'

import { SCENARIO_IDS, type ScenarioId } from '@/contracts/scenario'
import { FIXED_NOW, isoAt } from '@/mocks/clock'
import { SCENARIO_CATALOG } from '@/mocks/scenarios/catalog'
import { buildScenario, validateScenarioReferences } from '@/mocks/scenarios/build'

const REQUIRED = [
  'anonymous',
  'authenticated-empty',
  'authenticated-populated',
  'account-switch-required',
  'session-expired',
  'video-awaiting-confirmation',
  'video-queued',
  'video-running',
  'video-succeeded',
  'video-failed',
  'video-cancelled',
  'video-compliance-blocked',
  'revision-conflict',
  'public-showcase',
] as const satisfies readonly ScenarioId[]

describe('deterministic scenario clock', () => {
  it('uses one fixed instant and stable second offsets', () => {
    expect(FIXED_NOW).toBe('2026-09-03T12:00:00.000Z')
    expect(isoAt(-60)).toBe('2026-09-03T11:59:00.000Z')
    expect(isoAt(90)).toBe('2026-09-03T12:01:30.000Z')
  })
})

describe('scenario catalogue', () => {
  it('contains every required viewer, job, conflict and public state exactly once', () => {
    expect(SCENARIO_IDS).toEqual(REQUIRED)
    expect(Object.keys(SCENARIO_CATALOG)).toEqual(REQUIRED)
    expect(new Set(Object.values(SCENARIO_CATALOG).map((entry) => entry.id)).size).toBe(REQUIRED.length)
  })

  it('gives every scenario stable metadata for the development switcher', () => {
    for (const id of REQUIRED) {
      expect(SCENARIO_CATALOG[id]).toMatchObject({ id, seedVersion: 1, fixedNow: FIXED_NOW })
      expect(SCENARIO_CATALOG[id].label.length).toBeGreaterThan(0)
      expect(SCENARIO_CATALOG[id].description.length).toBeGreaterThan(0)
    }
  })
})

describe('buildScenario', () => {
  it('builds every required scenario byte-for-byte deterministically', () => {
    for (const id of REQUIRED) {
      expect(JSON.stringify(buildScenario(id))).toBe(JSON.stringify(buildScenario(id)))
    }
  })

  it('returns a fresh object graph on every build', () => {
    const first = buildScenario('video-running')
    const second = buildScenario('video-running')
    const firstCanonical = first.projects.find((project) => project.id === 'prj_video_demo')
    const secondCanonical = second.projects.find((project) => project.id === 'prj_video_demo')
    if (!firstCanonical || !secondCanonical) throw new Error('canonical video project missing')
    firstCanonical.name = 'mutated'
    first.canvases[0].document.nodes[0].name = 'mutated node'

    expect(secondCanonical.name).toBe('Seedance2.0体验')
    expect(second.canvases[0].document.nodes[0].name).toBe('故事梗概')
  })

  it('keeps every project, canvas, node, job, artifact and asset reference valid', () => {
    for (const id of REQUIRED) {
      expect(validateScenarioReferences(buildScenario(id)), id).toEqual([])
    }
  })

  it('seeds three ordered and navigable root projects for authenticated desktop surfaces', () => {
    const state = buildScenario('authenticated-populated')
    const projects = state.projects.filter((project) => project.folderId === null)
    const canvases = new Map(state.canvases.map((canvas) => [canvas.id, canvas]))

    expect(projects.map((project) => project.id)).toEqual([
      'prj_untitled_demo',
      'prj_doro_demo',
      'prj_video_demo',
    ])
    expect(projects.map((project) => project.updatedAt)).toEqual(
      projects
        .map((project) => project.updatedAt)
        .slice()
        .sort()
        .reverse(),
    )
    expect(projects.every((project) => project.coverUrl === null || project.coverUrl.startsWith('/fixtures/libtv/'))).toBe(true)
    expect(projects.every((project) => project.canvasIds.length === 1)).toBe(true)
    expect(
      projects.every((project) => {
        const canvas = canvases.get(project.canvasIds[0])
        return canvas?.projectId === project.id
      }),
    ).toBe(true)
  })

  it('represents every video job state with stable project topology', () => {
    const states = [
      'video-awaiting-confirmation',
      'video-queued',
      'video-running',
      'video-succeeded',
      'video-failed',
      'video-cancelled',
      'video-compliance-blocked',
    ] as const satisfies readonly ScenarioId[]

    for (const id of states) {
      const state = buildScenario(id)
      expect(state.projects.find((project) => project.id === 'prj_video_demo')?.name).toBe('Seedance2.0体验')
      expect(state.canvases[0].id).toBe('can_video_main')
      expect(state.canvases[0].document.nodes.map((node) => node.id)).toEqual([
        'node_text_01',
        'node_image_01',
        'node_video_01',
        'node_composite_01',
      ])
    }
  })

  it('maps scenario names to the exact primary video job status', () => {
    const expected = {
      'video-awaiting-confirmation': 'awaiting_confirmation',
      'video-queued': 'queued',
      'video-running': 'running',
      'video-succeeded': 'succeeded',
      'video-failed': 'failed',
      'video-cancelled': 'cancelled',
      'video-compliance-blocked': 'compliance_blocked',
    } as const

    for (const [id, status] of Object.entries(expected) as Array<[keyof typeof expected, (typeof expected)[keyof typeof expected]]>) {
      expect(buildScenario(id).jobs[0]).toMatchObject({ id: 'job_video_01', status })
    }
  })

  it('uses only local fixture or local API URLs', () => {
    for (const id of REQUIRED) {
      const serialized = JSON.stringify(buildScenario(id))
      expect(serialized, id).not.toMatch(/https?:\/\//)
      expect(serialized, id).not.toContain('liblib.cloud')
      expect(serialized, id).not.toContain('liblib.art')
    }
  })

  it('keeps balances equal to each space ledger tail', () => {
    for (const id of REQUIRED) {
      const state = buildScenario(id)
      for (const space of state.spaces) {
        const tail = state.ledger.filter((entry) => entry.spaceId === space.id).at(-1)
        expect(state.balances[space.id], `${id}:${space.id}`).toBe(tail?.balanceAfter ?? 0)
      }
    }
  })

  it('uses a higher revision for the explicit conflict scenario', () => {
    expect(buildScenario('authenticated-populated').canvases[0].revision).toBe(7)
    expect(buildScenario('revision-conflict').canvases[0].revision).toBe(8)
  })
})
