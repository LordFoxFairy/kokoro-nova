import { describe, expect, it } from 'vitest'

import {
  SCRIPT_V2_MAX_DURATION_SECONDS,
  SCRIPT_V2_MIN_DURATION_SECONDS,
  SCRIPT_V2_SHOT_SIZES,
  appendScriptV2Row,
  buildOfficialPromptRecomputeEnvelope,
  buildOfficialScriptGenerationEnvelope,
  defaultScriptV2State,
  moveScriptV2Row,
  parseOfficialScriptResult,
  readScriptV2State,
  removeScriptV2Row,
  resolveScriptV2PromptWriteback,
  scriptV2PromptInputFingerprint,
  scriptV2BatchBlockedReason,
  scriptV2StateToCsv,
  serializeOfficialScriptNode,
  updateScriptV2Row,
} from '@/domain/script-v2'

describe('Script V2 canonical state', () => {
  it('exposes one shared batch gate for empty prompts and unfinished video assets', () => {
    let state = defaultScriptV2State('batch-gate')
    expect(scriptV2BatchBlockedReason(state, 'image')).toBe('请先添加至少一个镜头')
    expect(scriptV2BatchBlockedReason(state, 'video')).toBe('请先添加至少一个镜头')

    state = appendScriptV2Row(state, {
      imageGenerationPrompt: '完整的分镜图提示词',
      videoMotionPrompt: '完整的视频运动提示词',
    })
    expect(scriptV2BatchBlockedReason(state, 'image')).toBeNull()
    expect(scriptV2BatchBlockedReason(state, 'video')).toBeNull()

    state = {
      ...state,
      assets: {
        ...state.assets,
        characters: [
          {
            id: 'asset_pending',
            role: 'character',
            name: '林默',
            description: '黑色风衣',
            source: 'ai',
            status: 'pending',
            createdAt: '2026-09-04T00:00:00.000Z',
            updatedAt: '2026-09-04T00:00:00.000Z',
          },
        ],
      },
    }
    expect(scriptV2BatchBlockedReason(state, 'image')).toBeNull()
    expect(scriptV2BatchBlockedReason(state, 'video')).toBe('有 1 个资产尚未准备完成')

    state = updateScriptV2Row(state, state.rows[0].id, { imageGenerationPrompt: '' })
    expect(scriptV2BatchBlockedReason(state, 'image')).toBe('有 1 个镜头缺少分镜图提示词')
  })

  it('exports a UTF-8 BOM CSV with every field safely quoted', () => {
    let state = defaultScriptV2State('csv')
    state = appendScriptV2Row(state, {
      plotDescription: '他说“开始”,\n然后转身',
      shotSize: '近景',
      durationSeconds: 7,
      dialogue: '“好”',
      imageGenerationPrompt: '霓虹, 雨夜',
      videoMotionPrompt: '镜头推进\n人物转身',
    })

    const csv = scriptV2StateToCsv(state)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"镜头编号","时长（秒）","景别"')
    expect(csv).toContain('"他说“开始”,\n然后转身"')
    expect(csv).toContain('"霓虹, 雨夜"')
    expect(csv).toContain('"镜头推进\n人物转身"')
  })

  it('freezes the observed shot-size vocabulary and default workspace state', () => {
    expect(SCRIPT_V2_SHOT_SIZES).toEqual([
      '大远景',
      '远景',
      '全景',
      '中远景',
      '中景',
      '中近景',
      '近景',
      '特写',
      '大特写',
      '头肩景',
      '半身景',
      '全身景',
    ])
    expect(SCRIPT_V2_MIN_DURATION_SECONDS).toBe(5)
    expect(SCRIPT_V2_MAX_DURATION_SECONDS).toBe(15)

    expect(defaultScriptV2State('script-seed')).toEqual(
      expect.objectContaining({
        version: 1,
        entry: null,
        activeStage: 'shots',
        title: '',
        originalStoryText: '',
        styleDescription: null,
        rows: [],
        assets: { characters: [], scenes: [], props: [] },
        generator: expect.objectContaining({
          modelId: 'gvlm-3.1',
          prompt: '',
          translating: true,
          status: 'idle',
        }),
        promptComposer: {
          singleMode: 'smart',
          batchMode: 'smart',
          modelId: 'gvlm-3.1',
        },
        promptBatchRuns: [],
      }),
    )
  })

  it('creates stable rows, clamps duration and keeps shot numbers dense', () => {
    let state = defaultScriptV2State('script-seed')
    state = appendScriptV2Row(state, {
      durationSeconds: 2,
      plotDescription: '第一镜',
      shotSize: '近景',
    })
    state = appendScriptV2Row(state, {
      durationSeconds: 99,
      plotDescription: '第二镜',
    })

    expect(state.rows.map((row) => [row.id, row.shotNumber, row.durationSeconds, row.shotSize])).toEqual([
      ['shot_e34a90f3', 1, 5, '近景'],
      ['shot_e44a9286', 2, 15, '近景'],
    ])

    state = moveScriptV2Row(state, 0, 1)
    expect(state.rows.map((row) => [row.id, row.shotNumber])).toEqual([
      ['shot_e44a9286', 1],
      ['shot_e34a90f3', 2],
    ])

    state = removeScriptV2Row(state, 'shot_e44a9286')
    expect(state.rows.map((row) => [row.id, row.shotNumber])).toEqual([['shot_e34a90f3', 1]])
  })

  it('invalidates only prompt tracks affected by authoring changes', () => {
    let state = defaultScriptV2State('prompt-seed')
    state = appendScriptV2Row(state, {
      plotDescription: '雨夜中的人物停在路灯下',
      imageGenerationPrompt: '图片提示词',
      videoMotionPrompt: '视频提示词',
      imagePromptState: 'synced',
      videoPromptState: 'user_edited',
      colorLabel: 'red',
    })
    const rowId = state.rows[0].id

    const recolored = updateScriptV2Row(state, rowId, { colorLabel: 'blue' })
    expect(recolored.rows[0]).toMatchObject({
      imagePromptState: 'synced',
      videoPromptState: 'user_edited',
      colorLabel: 'blue',
    })

    const rewritten = updateScriptV2Row(recolored, rowId, { plotDescription: '清晨中的人物走过路灯' })
    expect(rewritten.rows[0]).toMatchObject({
      imagePromptState: 'stale',
      videoPromptState: 'user_edited_stale',
    })

    const imageOnly = updateScriptV2Row(rewritten, rowId, {
      imageGenerationPrompt: '手工图片提示词',
      imagePromptState: 'user_edited',
    })
    expect(imageOnly.rows[0]).toMatchObject({
      imagePromptState: 'user_edited',
      videoPromptState: 'user_edited_stale',
    })
  })
})

describe('Script V2 legacy migration', () => {
  it('migrates the current flat draft without losing shots, assets or references', () => {
    const state = readScriptV2State(
      {
        draft: {
          entry: 'screenplay',
          logline: '雨夜追踪',
          shots: [
            {
              id: 'legacy-shot-1',
              index: 1,
              durationSeconds: 8,
              description: '@林夏在雨夜停下脚步',
              shotSize: '近景',
              dialogue: '林夏：有人跟着我。',
              sfx: '雨声',
              cameraMove: '缓慢推进',
              finalPrompt: '旧版最终画面提示词',
              assetRefs: ['legacy-asset-1'],
            },
          ],
          assets: [
            {
              id: 'legacy-asset-1',
              kind: 'character',
              name: '林夏',
              description: '黑色风衣，短发',
              source: 'canvas',
              previewHue: 220,
              referenceUrl: '/fixtures/libtv/script/linxia.svg',
            },
          ],
        },
      },
      'node-script-1',
    )

    expect(state).toMatchObject({
      version: 1,
      entry: 'screenplay',
      title: '雨夜追踪',
      originalStoryText: '雨夜追踪',
      assets: {
        characters: [
          {
            id: 'legacy-asset-1',
            role: 'character',
            name: '林夏',
            description: '黑色风衣，短发',
            source: 'canvas',
            status: 'ready',
            thumbnailUrl: '/fixtures/libtv/script/linxia.svg',
          },
        ],
      },
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({
      id: 'legacy-shot-1',
      shotNumber: 1,
      durationSeconds: 8,
      plotDescription: '@林夏在雨夜停下脚步',
      shotSize: '近景',
      dialogue: '林夏：有人跟着我。',
      audioEffects: '雨声',
      cinematics: { shotSize: '近景', cameraMovement: '缓慢推进' },
      imageGenerationPrompt: '旧版最终画面提示词',
      imagePromptState: 'synced',
      videoPromptState: 'none',
      characters: [expect.objectContaining({ characterAssetId: 'legacy-asset-1', characterName: '林夏' })],
    })
  })

  it('normalizes malformed canonical input without throwing or duplicating row ids', () => {
    const imported = {
      version: 1,
      identitySeed: 'bad-state',
      nextRowOrdinal: -5,
      nextAssetOrdinal: 0,
      entry: 'unknown',
      activeStage: 'elsewhere',
      rows: [
        { id: 'same', hiddenUuid: '', shotNumber: 8, durationSeconds: 4, shotSize: '微距', plotDescription: 12 },
        { id: 'same', hiddenUuid: '', shotNumber: 99, durationSeconds: 16, shotSize: '近景' },
      ],
      assets: { characters: 'bad', scenes: [], props: [] },
      generator: null,
      promptComposer: null,
      promptBatchRuns: 'bad',
    }

    expect(() => readScriptV2State({ scriptV2: imported }, 'fallback-seed')).not.toThrow()
    const state = readScriptV2State({ scriptV2: imported }, 'fallback-seed')
    expect(state.entry).toBeNull()
    expect(state.activeStage).toBe('shots')
    expect(state.rows.map((row) => [row.id, row.shotNumber, row.durationSeconds, row.shotSize])).toEqual([
      ['same', 1, 5, '中景'],
      ['shot_7431e62b', 2, 15, '近景'],
    ])
    expect(state.assets).toEqual({ characters: [], scenes: [], props: [] })
    expect(state.nextRowOrdinal).toBeGreaterThan(2)
  })
})

describe('Script V2 official protocol adapters', () => {
  function populatedState() {
    let state = defaultScriptV2State('official-seed')
    state = {
      ...state,
      title: '雨夜追踪',
      originalStoryText: '林夏穿过旧城，发现有人跟踪。',
      styleDescription: '冷色电影质感',
      assets: {
        ...state.assets,
        characters: [
          {
            id: 'asset-character-1',
            role: 'character',
            name: '林夏',
            description: '黑色风衣，短发',
            source: 'canvas',
            status: 'ready',
            thumbnailUrl: '/fixtures/libtv/script/linxia.svg',
            linkedNodeId: 'NODE_IMAGE_1',
            createdAt: '2026-09-03T00:00:00.000Z',
            updatedAt: '2026-09-03T00:00:00.000Z',
          },
        ],
      },
    }
    return appendScriptV2Row(state, {
      durationSeconds: 7,
      plotDescription: '@林夏穿过积水的旧城街道',
      plotDescriptionEntityRefs: [{ text: '林夏', assetId: 'asset-character-1' }],
      shotSize: '中景',
      cinematics: { shotSize: '中景', cameraMovement: '跟随推进', lighting: '冷蓝路灯' },
      dialogueLines: [
        {
          characterRef: 'asset-character-1',
          kind: 'speech',
          text: '@林夏别回头。',
          entityRefs: [{ text: '林夏', assetId: 'asset-character-1' }],
        },
      ],
      sceneAssetIds: [],
      propAssetIds: [],
      lightingAndAtmosphere: '雨幕与霓虹倒影',
      audioEffects: '雨声、远处车鸣',
    })
  }

  it('serializes the observed node data shape and initial generation envelope', () => {
    const state = populatedState()

    expect(serializeOfficialScriptNode(state)).toMatchObject({
      type: 'script-v2',
      title: '雨夜追踪',
      rows: [
        expect.objectContaining({
          shotNumber: 1,
          durationSeconds: 7,
          plotDescription: '@林夏穿过积水的旧城街道',
          imagePromptState: 'none',
          videoPromptState: 'none',
        }),
      ],
      viewMode: 'table',
      action: 'script_generate',
      generatorType: 'default',
      activeViewId: 'default',
    })

    expect(
      buildOfficialScriptGenerationEnvelope({
        state,
        nodeId: 'NODE_ID',
        projectId: 'PROJECT_ID',
        incoming: {
          textList: ['补充文本'],
          imageList: [{ nodeId: 'SOURCE_NODE', url: '/fixtures/source.svg', label: '人物参考' }],
          videoList: [],
          audioList: [],
        },
      }),
    ).toEqual({
      params: {
        prompt: '林夏穿过旧城，发现有人跟踪。',
        model: 'aurora-3-prime',
        count: 1,
        scene: 'script-generate-v2',
        scenePayload: {
          source_images: [
            {
              ref_id: 'src_img_1',
              node_id: 'SOURCE_NODE',
              url: '/fixtures/source.svg',
              display_name: '人物参考',
            },
          ],
        },
        textList: ['补充文本'],
        imageList: ['/fixtures/source.svg'],
        videoList: [],
        audioList: [],
      },
      provider: 'aurora',
      model: 'aurora-3-prime',
      taskType: 'text',
      metadata: { node_id: 'NODE_ID', project_id: 'PROJECT_ID' },
    })
  })

  it('builds the recompute scene payload with official snake-case fields and bounded context', () => {
    let state = populatedState()
    for (let index = 0; index < 102; index += 1) {
      state = appendScriptV2Row(state, { plotDescription: `上下文镜头 ${index + 2}` })
    }
    const target = state.rows[0]
    const envelope = buildOfficialPromptRecomputeEnvelope({
      state,
      rowIds: [target.id],
      nodeId: 'NODE_ID',
      projectId: 'PROJECT_ID',
    })

    expect(envelope.params.scene).toBe('script-recompute-prompts-v2')
    expect(envelope.params.scenePayload.shots).toEqual([
      expect.objectContaining({
        shot_id: target.id,
        shot_number: 1,
        duration_seconds: 7,
        plot_description: '@林夏穿过积水的旧城街道',
        shot_size: '中景',
        dialogue_lines: [
          {
            character_ref: 'asset-character-1',
            kind: 'speech',
            text: '别回头。',
            entity_refs: [{ text: '林夏', asset_id: 'asset-character-1' }],
          },
        ],
      }),
    ])
    expect(envelope.params.scenePayload.context_shots).toHaveLength(100)
    expect(envelope.params.scenePayload.assets?.characters).toEqual([
      expect.objectContaining({ id: 'asset-character-1', role: 'character', name: '林夏' }),
    ])
    expect(envelope.params.scenePayload.story_context).toEqual({
      original_story_text: '林夏穿过旧城，发现有人跟踪。',
    })
    expect(envelope.params.scenePayload.meta).toEqual({ visual_style: '冷色电影质感' })

    expect(() =>
      buildOfficialPromptRecomputeEnvelope({
        state,
        rowIds: state.rows.slice(0, 21).map((row) => row.id),
        nodeId: 'NODE_ID',
        projectId: 'PROJECT_ID',
      }),
    ).toThrow(/20/)
  })

  it('parses direct, nested and assets-only official task results', () => {
    const direct = parseOfficialScriptResult(
      JSON.stringify({
        meta: { title: '夜行', visual_style: '蓝调电影感' },
        shots: [
          {
            shot_id: 'remote-shot-1',
            shot_number: 1,
            duration_seconds: 7,
            plot_description: '林夏走入街巷',
            shot_size: '近景',
            image_generation_prompt: '分镜图提示词',
            video_motion_prompt: '视频运动提示词',
          },
        ],
        assets: { characters: [{ id: 'asset-1', name: '林夏', description: '短发' }], scenes: [], props: [] },
      }),
      { operation: 'generate-full', seed: 'result-seed' },
    )
    expect(direct).toMatchObject({
      operation: 'generate-full',
      title: '夜行',
      styleDescription: '蓝调电影感',
      rows: [
        {
          id: 'remote-shot-1',
          shotNumber: 1,
          imageGenerationPrompt: '分镜图提示词',
          videoMotionPrompt: '视频运动提示词',
          imagePromptState: 'synced',
          videoPromptState: 'synced',
        },
      ],
    })

    const nested = parseOfficialScriptResult(
      JSON.stringify({
        texts: [
          JSON.stringify({
            shots: [
              {
                shot_id: 'remote-shot-1',
                image_generation_prompt: '新的图片提示词',
                video_motion_prompt: '新的视频提示词',
              },
            ],
          }),
        ],
        columns: ['镜号', '画面描述'],
      }),
      { operation: 'recompute-prompts', seed: 'result-seed' },
    )
    expect(nested).toEqual({
      operation: 'recompute-prompts',
      shots: [
        {
          shotId: 'remote-shot-1',
          imageGenerationPrompt: '新的图片提示词',
          videoMotionPrompt: '新的视频提示词',
        },
      ],
    })

    expect(
      parseOfficialScriptResult(
        JSON.stringify({ assets: { characters: [], scenes: [{ id: 'scene-1', name: '旧城' }], props: [] } }),
        { operation: 'recognize-assets-only', seed: 'result-seed' },
      ),
    ).toMatchObject({ operation: 'recognize-assets-only', assets: { scenes: [{ id: 'scene-1', name: '旧城' }] } })
  })

  it('writes recomputed tracks only for the current operation and marks changed source input stale', () => {
    let state = populatedState()
    const row = state.rows[0]
    const imageFingerprint = scriptV2PromptInputFingerprint(row, 'image', state.assets, state.styleDescription)
    const videoFingerprint = scriptV2PromptInputFingerprint(row, 'video', state.assets, state.styleDescription)
    const contexts = [
      { shotId: row.id, track: 'image' as const, operationId: 'operation-1', requestInputFingerprint: imageFingerprint },
      { shotId: row.id, track: 'video' as const, operationId: 'operation-1', requestInputFingerprint: videoFingerprint },
    ]
    const result = {
      operation: 'recompute-prompts' as const,
      shots: [
        {
          shotId: row.id,
          imageGenerationPrompt: '返回的图片提示词',
          videoMotionPrompt: '返回的视频提示词',
        },
      ],
    }

    state = resolveScriptV2PromptWriteback({
      state,
      result,
      requestContexts: contexts,
      latestOperationIds: {
        [`${row.id}:image`]: 'operation-1',
        [`${row.id}:video`]: 'operation-1',
      },
    })
    expect(state.rows[0]).toMatchObject({
      imageGenerationPrompt: '返回的图片提示词',
      videoMotionPrompt: '返回的视频提示词',
      imagePromptState: 'synced',
      videoPromptState: 'synced',
    })

    const changed = updateScriptV2Row(state, row.id, { plotDescription: '提交后发生变化的新画面' })
    const stale = resolveScriptV2PromptWriteback({
      state: changed,
      result: {
        ...result,
        shots: [
          {
            shotId: row.id,
            imageGenerationPrompt: '迟到但仍属于当前操作的图片提示词',
            videoMotionPrompt: '迟到但仍属于当前操作的视频提示词',
          },
        ],
      },
      requestContexts: contexts,
      latestOperationIds: {
        [`${row.id}:image`]: 'operation-1',
        [`${row.id}:video`]: 'operation-1',
      },
    })
    expect(stale.rows[0]).toMatchObject({
      imageGenerationPrompt: '迟到但仍属于当前操作的图片提示词',
      videoMotionPrompt: '迟到但仍属于当前操作的视频提示词',
      imagePromptState: 'stale',
      videoPromptState: 'stale',
    })

    const manuallyEdited = updateScriptV2Row(changed, row.id, {
      imageGenerationPrompt: '我的手工图片提示词',
    })
    const ignored = resolveScriptV2PromptWriteback({
      state: manuallyEdited,
      result,
      requestContexts: contexts,
      latestOperationIds: { [`${row.id}:video`]: 'operation-1' },
    })
    expect(ignored.rows[0].imageGenerationPrompt).toBe('我的手工图片提示词')
  })
})
