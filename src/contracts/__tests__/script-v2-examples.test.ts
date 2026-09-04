import { describe, expect, it } from 'vitest'

import stateExample from '../../../docs/api/examples/script-v2-state.json'
import quoteRequestExample from '../../../docs/api/examples/script-v2-quote.request.json'
import quoteResponseExample from '../../../docs/api/examples/script-v2-quote.response.json'
import runRequestExample from '../../../docs/api/examples/script-v2-run.request.json'
import runResponseExample from '../../../docs/api/examples/script-v2-run.response.json'
import officialRecomputeExample from '../../../docs/api/examples/script-v2-official-recompute.sanitized.json'
import { NodeExtraSchema } from '@/contracts/local'
import {
  CreateScriptV2RunRequestSchema,
  OfficialPromptRecomputeEnvelopeSchema,
  ScriptV2QuoteRequestSchema,
  ScriptV2QuoteResponseSchema,
  ScriptV2RunResponseSchema,
  ScriptV2StateSchema,
} from '@/contracts/script-v2'

describe('Script V2 API examples', () => {
  it('keeps the persisted state example executable at the canvas boundary', () => {
    const state = ScriptV2StateSchema.parse(stateExample)
    expect(state.version).toBe(1)
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({
      imagePromptState: 'synced',
      videoPromptState: 'user_edited',
    })
    expect(state.assets.characters).toHaveLength(1)
    expect(state.assets.scenes).toEqual([])
    expect(state.assets.props).toEqual([])
    expect(NodeExtraSchema.parse({ scriptV2: state }).scriptV2).toEqual(state)
  })

  it('rejects duration and shot-size values outside the observed vocabulary', () => {
    const below = structuredClone(stateExample)
    below.rows[0].durationSeconds = 4
    const above = structuredClone(stateExample)
    above.rows[0].durationSeconds = 16
    const unknown = structuredClone(stateExample)
    unknown.rows[0].shotSize = '微距'

    expect(ScriptV2StateSchema.safeParse(below).success).toBe(false)
    expect(ScriptV2StateSchema.safeParse(above).success).toBe(false)
    expect(ScriptV2StateSchema.safeParse(unknown).success).toBe(false)
  })

  it('validates quote and run examples through discriminated runtime contracts', () => {
    expect(ScriptV2QuoteRequestSchema.parse(quoteRequestExample)).toEqual(quoteRequestExample)
    expect(ScriptV2QuoteResponseSchema.parse(quoteResponseExample)).toEqual(quoteResponseExample)
    expect(CreateScriptV2RunRequestSchema.parse(runRequestExample)).toEqual(runRequestExample)
    expect(ScriptV2RunResponseSchema.parse(runResponseExample)).toEqual(runResponseExample)
  })

  it('rejects a result whose payload does not match its operation', () => {
    const mismatched = structuredClone(runResponseExample)
    mismatched.run.operation = 'recompute-prompts'

    expect(ScriptV2RunResponseSchema.safeParse(mismatched).success).toBe(false)
  })

  it('keeps the sanitized official recompute evidence parseable and placeholder-only', () => {
    const parsed = OfficialPromptRecomputeEnvelopeSchema.parse(officialRecomputeExample)
    expect(parsed.params.scene).toBe('script-recompute-prompts-v2')
    expect(parsed.metadata).toEqual({ node_id: 'NODE_ID', project_id: 'PROJECT_ID' })
    expect(JSON.stringify(parsed)).not.toMatch(/[0-9a-f]{24,}/i)
  })
})
