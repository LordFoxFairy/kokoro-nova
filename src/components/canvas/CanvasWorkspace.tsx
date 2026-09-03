'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { createEdge, createNode } from '@/domain/factory'
import { SLASH_PRESETS, type CharacterPreset } from '@/domain/libraries'
import { instantiatePreset, PRESETS_BY_ID, type ToolboxPreset } from '@/domain/presets'
import { ids, newId } from '@/domain/ids'
import {
  pruneVideoReferenceExtras,
  readVideoElementMarks,
  toggleVideoReference,
} from '@/domain/video-references'
import type {
  Artifact,
  Asset,
  CanvasMutation,
  GenerationJob,
  NodeData,
  NodeType,
  WorkflowGroup,
} from '@/domain/types'
import { client } from '@/lib/api'
import { useEditor } from '@/lib/editor-store'
import { AgentPanel } from '../agent/AgentPanel'
import { AssetLibraryPanel } from '../assets/AssetLibraryPanel'
import { DirectorStudio, type CapturedShot, type DirectorScene } from '../director/DirectorStudio'
import { ScriptWizard } from '../script/ScriptWizard'
import type { ScriptDraft } from '../script/script-model'
import { StoryboardView } from '../storyboard/StoryboardView'
import { Menu } from '../ui/Menu'
import { Spinner } from '../ui/controls'
import { AssetSidebar } from './AssetSidebar'
import { PresenceLayer } from './PresenceLayer'
import { BottomToolbar } from './BottomToolbar'
import { CharacterPanel, HistoryPanel, MaterialPanel, ToolboxPanel } from './LibraryPanels'
import { NodeInspector } from './NodeInspector'
import { ShortcutsPanel, useCanvasShortcuts } from './shortcuts'
import { TopBar } from './TopBar'
import { ConfirmGate } from './ConfirmGate'
import { Toasts } from './Toasts'
import { WorkflowCanvas, useCanvasCommands, nextFreeSpot } from './WorkflowCanvas'
import { NODE_SIZE } from '@/domain/factory'

/** Poll interval while at least one job is in flight. */
const POLL_MS = 1200

function WorkspaceInner({ projectId, canvasId }: { projectId: string; canvasId?: string }) {
  const flow = useReactFlow()
  const load = useEditor((s) => s.load)
  const loading = useEditor((s) => s.loading)
  const viewMode = useEditor((s) => s.viewMode)
  const document = useEditor((s) => s.document)
  const jobs = useEditor((s) => s.jobs)
  const leftPanel = useEditor((s) => s.leftPanel)
  const setLeftPanel = useEditor((s) => s.setLeftPanel)
  const inspectedNodeId = useEditor((s) => s.inspectedNodeId)
  const inspect = useEditor((s) => s.inspect)
  const commit = useEditor((s) => s.commit)
  const commitWith = useEditor((s) => s.commitWith)
  const upsertJob = useEditor((s) => s.upsertJob)
  const setBalance = useEditor((s) => s.setBalance)
  const applyServerDocument = useEditor((s) => s.applyServerDocument)
  const select = useEditor((s) => s.select)
  const toast = useEditor((s) => s.toast)

  const commands = useCanvasCommands()
  const [materialKind, setMaterialKind] = useState<'style' | 'effect'>('style')
  const [pendingJob, setPendingJob] = useState<GenerationJob | null>(null)
  /** Node whose full-screen editor is open; its type selects which one. */
  const [studioNodeId, setStudioNodeId] = useState<string | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [storyboardConfig, setStoryboardConfig] = useState<{ groupId: string; anchor: { x: number; y: number } } | null>(
    null,
  )
  const [selectionMode, setSelectionMode] = useState<{
    kind: 'reference' | 'element'
    targetNodeId: string
  } | null>(null)

  useEffect(() => {
    void load(projectId, canvasId)
  }, [projectId, canvasId, load])

  /* ---------------- generation ---------------- */

  const runNode = useCallback(
    async (nodeId: string) => {
      const currentCanvasId = useEditor.getState().canvasId
      if (!currentCanvasId) return
      try {
        const { job } = await client.jobs.create({
          canvasId: currentCanvasId,
          nodeId,
        })
        upsertJob(job)
        // Confirm gate: a quoted job waits for explicit approval.
        setPendingJob(job)
      } catch (error) {
        toast(error instanceof Error ? error.message : '无法提交生成', 'error')
      }
    },
    [upsertJob, toast],
  )

  const confirmJob = useCallback(
    async (jobId: string) => {
      try {
        const { job, balance } = await client.jobs.transition(jobId, 'confirm')
        upsertJob(job)
        setBalance(balance)
        setPendingJob(null)
      } catch (error) {
        toast(error instanceof Error ? error.message : '确认失败', 'error')
        setPendingJob(null)
      }
    },
    [upsertJob, setBalance, toast],
  )

  const cancelJob = useCallback(
    async (jobId: string) => {
      try {
        const { job, balance } = await client.jobs.transition(jobId, 'cancel')
        upsertJob(job)
        setBalance(balance)
        setPendingJob(null)
      } catch (error) {
        toast(error instanceof Error ? error.message : '取消失败', 'error')
      }
    },
    [upsertJob, setBalance, toast],
  )

  // Poll in-flight jobs; terminal states rewrite the document server-side.
  const activeJobIds = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => j.id),
    [jobs],
  )
  const pollRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (activeJobIds.length === 0) return
    const timer = setInterval(async () => {
      for (const jobId of activeJobIds) {
        if (pollRef.current.has(jobId)) continue
        pollRef.current.add(jobId)
        try {
          const result = await client.jobs.get(jobId)
          upsertJob(result.job)
          setBalance(result.balance)
          if (result.document && result.revision !== null) {
            applyServerDocument(result.document, result.revision)
          }
          if (result.job.status === 'failed' || result.job.status === 'compliance_blocked') {
            toast(result.job.error ?? '生成失败', 'error')
          }
        } catch {
          // Transient failures are retried on the next tick.
        } finally {
          pollRef.current.delete(jobId)
        }
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [activeJobIds, upsertJob, setBalance, applyServerDocument, toast])

  /* ---------------- node helpers ---------------- */

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<NodeData>) => {
      const node = useEditor.getState().document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      void commit([{ op: 'updateNode', nodeId, patch: { data: { ...node.data, ...patch } } }], '编辑节点')
    },
    [commit],
  )

  const locateNode = useCallback(
    (nodeId: string) => {
      const node = useEditor.getState().document.nodes.find((n) => n.id === nodeId)
      if (!node) return
      select([nodeId])
      flow.setCenter(node.position.x + node.size.width / 2, node.position.y + node.size.height / 2, {
        zoom: Math.max(0.7, flow.getZoom()),
        duration: 320,
      })
    },
    [flow, select],
  )

  const startVideoSelection = useCallback(
    (kind: 'reference' | 'element', targetNodeId: string) => {
      const target = useEditor.getState().document.nodes.find((node) => node.id === targetNodeId)
      if (target?.type !== 'video') return
      setLeftPanel(null)
      setStoryboardConfig(null)
      inspect(targetNodeId)
      setSelectionMode({ kind, targetNodeId })
    },
    [inspect, setLeftPanel],
  )

  const returnFromSelection = useCallback(() => {
    const targetNodeId = selectionMode?.targetNodeId
    setSelectionMode(null)
    if (!targetNodeId) return
    inspect(targetNodeId)
    window.requestAnimationFrame(() => locateNode(targetNodeId))
  }, [inspect, locateNode, selectionMode])

  const exitSelection = useCallback(() => {
    setSelectionMode(null)
    inspect(null)
  }, [inspect])

  const toggleSelectedReference = useCallback(
    async (sourceNodeId: string) => {
      const targetNodeId = selectionMode?.targetNodeId
      if (!targetNodeId || selectionMode.kind !== 'reference') return
      await commitWith((doc) => {
        const removing = doc.edges.some(
          (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
        )
        const mutations = toggleVideoReference(doc, targetNodeId, sourceNodeId)
        if (!removing) return mutations
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return mutations
        return [
          ...mutations,
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: pruneVideoReferenceExtras(target.data.extra, sourceNodeId),
              },
            },
          },
        ]
      }, '选择视频参考')
    },
    [commitWith, selectionMode],
  )

  const removeVideoReference = useCallback(
    async (targetNodeId: string, sourceNodeId: string) => {
      await commitWith((doc) => {
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return []
        const edge = doc.edges.find(
          (candidate) => candidate.source === sourceNodeId && candidate.target === targetNodeId,
        )
        if (!edge) return []
        return [
          { op: 'removeEdge' as const, edgeId: edge.id },
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: pruneVideoReferenceExtras(target.data.extra, sourceNodeId),
              },
            },
          },
        ]
      }, '移除视频参考')
    },
    [commitWith],
  )

  const selectElementSource = useCallback(
    async (sourceNodeId: string) => {
      const targetNodeId = selectionMode?.targetNodeId
      if (!targetNodeId || selectionMode.kind !== 'element') return

      const markId = newId('elm')
      const ok = await commitWith((doc) => {
        const target = doc.nodes.find((node) => node.id === targetNodeId)
        if (!target) return []
        const marks = readVideoElementMarks(target.data.extra)
        const referenceExists = doc.edges.some(
          (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
        )
        const referenceMutations = referenceExists
          ? []
          : toggleVideoReference(doc, targetNodeId, sourceNodeId)
        const nextMark = {
          id: markId,
          nodeId: sourceNodeId,
          x: 0.22,
          y: 0.18,
          width: 0.44,
          height: 0.58,
          label: `元素 ${marks.length + 1}`,
        }
        return [
          ...referenceMutations,
          {
            op: 'updateNode' as const,
            nodeId: targetNodeId,
            patch: {
              data: {
                ...target.data,
                extra: { ...target.data.extra, elementMarks: [...marks, nextMark] },
              },
            },
          },
        ]
      }, '标记视频参考元素')

      if (ok) {
        setSelectionMode(null)
        inspect(targetNodeId)
        window.requestAnimationFrame(() => locateNode(targetNodeId))
      }
    },
    [commitWith, inspect, locateNode, selectionMode],
  )

  const selectCanvasCandidate = useCallback(
    (sourceNodeId: string) => {
      if (selectionMode?.kind === 'reference') void toggleSelectedReference(sourceNodeId)
      if (selectionMode?.kind === 'element') void selectElementSource(sourceNodeId)
    },
    [selectElementSource, selectionMode, toggleSelectedReference],
  )

  /** Pan so a rect in flow coordinates sits inside the visible canvas area. */
  const ensureVisible = useCallback(
    (position: { x: number; y: number }, size: { width: number; height: number }) => {
      const topLeft = flow.flowToScreenPosition({ x: position.x, y: position.y })
      const bottomRight = flow.flowToScreenPosition({
        x: position.x + size.width,
        y: position.y + size.height,
      })

      // Reserve room for the top bar and the right-hand drawers.
      const inside =
        topLeft.x > 32 &&
        topLeft.y > 80 &&
        bottomRight.x < window.innerWidth - 32 &&
        bottomRight.y < window.innerHeight - 100

      if (!inside) {
        flow.setCenter(position.x + size.width / 2, position.y + size.height / 2, {
          zoom: flow.getZoom(),
          duration: 260,
        })
      }
    },
    [flow],
  )

  const addNodeAtViewportCenter = useCallback(
    async (type: NodeType) => {
      const center = flow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const size = NODE_SIZE[type]
      // The store resolves the final, non-overlapping spot near this hint.
      const node = await commands.addNode(type, {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      })
      // Avoidance can push the node past the edge of the viewport; follow it so
      // a freshly created node is never left off-screen.
      if (node) ensureVisible(node.position, node.size)
    },
    [flow, commands, ensureVisible],
  )

  /* ---------------- library actions ---------------- */

  const usePreset = useCallback(
    async (preset: ToolboxPreset) => {
      const doc = useEditor.getState().document
      const origin = nextFreeSpot(doc.nodes)
      const { mutations, nodes } = instantiatePreset(preset, origin, doc.nodes)
      const ok = await commit(mutations, `使用模板 ${preset.name}`)
      if (ok) {
        select(nodes.map((n) => n.id))
        flow.fitView({ nodes: nodes.map((n) => ({ id: n.id })), duration: 400, padding: 0.35 })
      }
    },
    [commit, select, flow],
  )

  const applyMaterial = useCallback(
    async (preset: { id: string; name: string; hue: number }, kind: 'style' | 'effect') => {
      const doc = useEditor.getState().document
      const node = createNode(kind, nextFreeSpot(doc.nodes), doc.nodes, { name: preset.name })
      node.data.extra = { presetId: preset.id, presetName: preset.name, hue: preset.hue }
      await commit([{ op: 'addNode', node }], `添加${kind === 'style' ? '风格' : '特效'}节点`)
    },
    [commit],
  )

  /** Applying a character creates four independent reference image nodes. */
  const applyCharacter = useCallback(
    async (character: CharacterPreset) => {
      const doc = useEditor.getState().document
      const origin = nextFreeSpot(doc.nodes)
      const pool = [...doc.nodes]
      const mutations: CanvasMutation[] = []

      character.references.forEach((reference, index) => {
        const node = createNode(
          'image',
          { x: origin.x + (index % 2) * 440, y: origin.y + Math.floor(index / 2) * 400 },
          pool,
          { name: `${character.name} · ${reference.label}` },
        )
        node.data.prompt = `${character.name}的${reference.label}`
        node.data.artifacts = [
          {
            id: ids.artifact(),
            jobId: 'character-library',
            kind: 'image',
            url: `/api/preview/character?hue=${reference.hue}&label=${encodeURIComponent(reference.label)}`,
            thumbnailUrl: `/api/preview/character?hue=${reference.hue}&label=${encodeURIComponent(reference.label)}`,
            width: 1024,
            height: 1024,
            durationSeconds: null,
            createdAt: new Date().toISOString(),
            modelId: 'lib-image-2',
            assetId: null,
          },
        ]
        pool.push(node)
        mutations.push({ op: 'addNode', node })
      })

      await commit(mutations, `应用角色 ${character.name}`)
    },
    [commit],
  )

  /** Drop a library asset onto the canvas as a media node already bound to it. */
  const insertAsset = useCallback(
    async (asset: Asset) => {
      const type: NodeType = asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image'
      await commitWith((doc) => {
        const node = createNode(type, nextFreeSpot(doc.nodes), doc.nodes, { name: asset.name })
        node.data.artifacts = [
          {
            id: ids.artifact(),
            jobId: 'asset-library',
            kind: asset.kind,
            url: asset.url,
            thumbnailUrl: asset.thumbnailUrl,
            width: asset.width,
            height: asset.height,
            durationSeconds: asset.durationSeconds,
            createdAt: new Date().toISOString(),
            modelId: 'lib-image-2',
            assetId: asset.id,
          },
        ]
        return [{ op: 'addNode', node }]
      }, '从资产库添加')
    },
    [commitWith],
  )

  /**
   * Turn a confirmed shot list into one node per shot, each wired to the script
   * node so the storyboard shows where every frame came from.
   */
  const batchFromShots = useCallback(
    async (scriptNodeId: string, draft: ScriptDraft, kind: 'image' | 'video') => {
      const shots = draft.shots.filter((shot) => shot.finalPrompt.trim())
      if (shots.length === 0) {
        toast('没有可用的最终提示词', 'error')
        return
      }

      await commitWith((doc) => {
        const source = doc.nodes.find((n) => n.id === scriptNodeId)
        if (!source) return []
        const pool = [...doc.nodes]
        const mutations: CanvasMutation[] = []

        shots.forEach((shot, index) => {
          const node = createNode(
            kind,
            { x: source.position.x + source.size.width + 160, y: source.position.y + index * 420 },
            pool,
            { name: `镜头 ${index + 1}` },
          )
          node.data.prompt = shot.finalPrompt
          if (kind === 'video') {
            node.data.output = { ...node.data.output, durationSeconds: shot.durationSeconds as 5 | 10 | 15 }
          }
          pool.push(node)
          mutations.push({ op: 'addNode', node })
          mutations.push({ op: 'addEdge', edge: createEdge(source.id, node.id) })
        })
        return mutations
      }, kind === 'video' ? '批量生视频' : '批量生图')

      toast(`已创建 ${shots.length} 个待确认${kind === 'video' ? '视频' : '图片'}节点`, 'success')
    },
    [commitWith, toast],
  )

  const insertArtifact = useCallback(
    async (artifact: Artifact) => {
      const doc = useEditor.getState().document
      const type: NodeType = artifact.kind === 'video' ? 'video' : artifact.kind === 'audio' ? 'audio' : 'image'
      const node = createNode(type, nextFreeSpot(doc.nodes), doc.nodes)
      node.data.artifacts = [artifact]
      await commit([{ op: 'addNode', node }], '从生成历史添加')
    },
    [commit],
  )

  /** Slash presets create a pending node wired to the source as a reference. */
  const applySlash = useCallback(
    async (sourceNodeId: string, presetId: string) => {
      const preset = SLASH_PRESETS.find((p) => p.id === presetId) ?? SLASH_PRESETS[0]
      const doc = useEditor.getState().document
      const source = doc.nodes.find((n) => n.id === sourceNodeId)
      if (!source) return

      const node = createNode(
        'image',
        { x: source.position.x + source.size.width + 120, y: source.position.y },
        doc.nodes,
        { name: preset.name },
      )
      node.data.prompt = preset.promptTemplate
      node.data.output = { ...node.data.output, ...preset.output }

      const ok = await commit(
        [
          { op: 'addNode', node },
          { op: 'addEdge', edge: createEdge(source.id, node.id) },
        ],
        `应用预设 ${preset.name}`,
      )
      if (ok) {
        select([node.id])
        inspect(node.id)
      }
    },
    [commit, select, inspect],
  )

  /** 拼接 creates a new stitched image node from the storyboard group. */
  const stitchGroup = useCallback(
    async (groupId: string) => {
      const doc = useEditor.getState().document
      const group = doc.groups.find((g) => g.id === groupId)
      if (!group?.storyboard) return
      const members = doc.nodes.filter((n) => group.nodeIds.includes(n.id))
      const bottom = Math.max(...members.map((n) => n.position.y + n.size.height))
      const left = Math.min(...members.map((n) => n.position.x))

      const node = createNode('image', { x: left, y: bottom + 140 }, doc.nodes, { name: '分镜拼接-2k' })
      node.data.artifacts = [
        {
          id: ids.artifact(),
          jobId: 'storyboard-stitch',
          kind: 'image',
          url: `/api/preview/stitch?rows=${group.storyboard.grid.rows}&cols=${group.storyboard.grid.cols}&seq=${group.storyboard.showSequenceNumbers ? 1 : 0}`,
          thumbnailUrl: `/api/preview/stitch?rows=${group.storyboard.grid.rows}&cols=${group.storyboard.grid.cols}&seq=${group.storyboard.showSequenceNumbers ? 1 : 0}`,
          width: 2048,
          height: 1152,
          durationSeconds: null,
          createdAt: new Date().toISOString(),
          modelId: 'lib-image-2',
          assetId: null,
        },
      ]
      await commit([{ op: 'addNode', node }], '分镜拼接')
    },
    [commit],
  )

  /* ---------------- shortcuts ---------------- */

  const runSelection = useCallback(() => {
    for (const nodeId of useEditor.getState().selection) void runNode(nodeId)
  }, [runNode])

  useCanvasShortcuts(
    {
      onGroup: () => void commands.groupSelection(),
      onMergeStoryboard: () => void commands.mergeStoryboardGroups(),
      onUngroup: () => void commands.ungroupSelection(),
      onConnect: () => void commands.connectSelection(),
      onDuplicate: () => void commands.duplicateSelection(),
      onRunSelection: runSelection,
      onNewNode: () => void addNodeAtViewportCenter('text'),
      onDelete: () => void commands.deleteSelection(),
      onArrange: () => void commands.autoArrange(),
    },
    viewMode === 'workflow' && !pendingJob,
  )

  const studioNode = document.nodes.find((n) => n.id === studioNodeId) ?? null
  const inspectedNode = document.nodes.find((n) => n.id === inspectedNodeId) ?? null
  const inspectedJob = inspectedNode?.data.jobId
    ? jobs.find((j) => j.id === inspectedNode.data.jobId) ?? null
    : null

  const storyboardGroup: WorkflowGroup | null = storyboardConfig
    ? document.groups.find((g) => g.id === storyboardConfig.groupId) ?? null
    : null

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-ink-400">
        <Spinner /> 正在加载画布
      </div>
    )
  }

  return (
    <div data-app-shell="editor" className="relative flex h-screen w-screen overflow-hidden bg-canvas">
      {!selectionMode && <AssetSidebar
        onLocateNode={locateNode}
        onRenameNode={(nodeId, name) => void commit([{ op: 'updateNode', nodeId, patch: { name } }], '重命名节点')}
        onDuplicateNode={(nodeId) => {
          const source = document.nodes.find((n) => n.id === nodeId)
          if (!source) return
          const copy = createNode(
            source.type,
            { x: source.position.x + 60, y: source.position.y + 60 },
            document.nodes,
            { name: `${source.name}副本`, data: JSON.parse(JSON.stringify(source.data)) },
          )
          void commit([{ op: 'addNode', node: copy }], '创建副本')
        }}
      />}

      <main className="relative min-w-0 flex-1">
        {!selectionMode && <TopBar />}
        {selectionMode && (
          <CanvasSelectionBanner
            kind={selectionMode.kind}
            onBack={returnFromSelection}
            onExit={exitSelection}
          />
        )}

        {viewMode === 'workflow' ? (
          <>
            <WorkflowCanvas
              onRun={runNode}
              onCancelJob={cancelJob}
              onOpenNode={inspect}
              openNodeId={inspectedNodeId}
              onStitch={stitchGroup}
              onOpenStoryboardConfig={(groupId, anchor) => setStoryboardConfig({ groupId, anchor })}
              selectionMode={selectionMode}
              onStartVideoSelection={startVideoSelection}
              onExitVideoSelection={returnFromSelection}
              onSelectCanvasCandidate={selectCanvasCandidate}
              onRemoveVideoReference={removeVideoReference}
              onLocateNode={locateNode}
            />
            {!selectionMode && <PresenceLayer canvasId={canvasId ?? null} />}
            {!selectionMode && (
              <BottomToolbar
                onAddNode={addNodeAtViewportCenter}
                onAutoArrange={() => void commands.autoArrange()}
                onOpenMaterial={(kind) => {
                  setMaterialKind(kind)
                  setLeftPanel('material')
                }}
                onOpenAssetLibrary={() => setAssetLibraryOpen(true)}
              />
            )}
          </>
        ) : (
          <StoryboardView />
        )}

        {viewMode === 'workflow' && inspectedNode && inspectedNode.type !== 'video' && (
          <NodeInspector
            node={inspectedNode}
            job={inspectedJob}
            onClose={() => inspect(null)}
            onPatch={patchNode}
            onRun={runNode}
            onCancel={cancelJob}
            onAddToAgent={(nodeId) => {
              const node = document.nodes.find((n) => n.id === nodeId)
              if (node) useEditor.getState().pushAgentRef({ id: node.id, label: node.name, kind: 'node' })
            }}
            onApplySlash={applySlash}
            onOpenStudio={setStudioNodeId}
          />
        )}
      </main>

      {!selectionMode && <AgentPanel />}

      {/* Panels */}
      <ToolboxPanel open={leftPanel === 'toolbox'} onClose={() => setLeftPanel(null)} onUse={usePreset} />
      <MaterialPanel
        open={leftPanel === 'material'}
        kind={materialKind}
        onClose={() => setLeftPanel(null)}
        onApply={applyMaterial}
      />
      <CharacterPanel open={leftPanel === 'character'} onClose={() => setLeftPanel(null)} onApply={applyCharacter} />
      <HistoryPanel open={leftPanel === 'history'} onClose={() => setLeftPanel(null)} onInsert={insertArtifact} />
      <ShortcutsPanel open={leftPanel === 'shortcuts'} onClose={() => setLeftPanel(null)} />

      {/* Full-screen editors owned by a specific node type. */}
      <DirectorStudio
        open={studioNode?.type === 'director'}
        onClose={() => setStudioNodeId(null)}
        initialScene={studioNode?.data.extra?.scene as DirectorScene | undefined}
        initialShots={studioNode?.data.extra?.shots as CapturedShot[] | undefined}
        onSave={(scene, shots) => {
          if (!studioNode) return
          patchNode(studioNode.id, { extra: { ...studioNode.data.extra, scene, shots } })
          setStudioNodeId(null)
          toast(`已保存导演台场景与 ${shots.length} 个镜头`, 'success')
        }}
      />

      <ScriptWizard
        open={studioNode?.type === 'script' || studioNode?.type === 'scriptLegacy'}
        onClose={() => setStudioNodeId(null)}
        initialDraft={studioNode?.data.extra?.draft as ScriptDraft | undefined}
        onApply={(draft, action) => {
          if (!studioNode) return
          patchNode(studioNode.id, { extra: { ...studioNode.data.extra, draft, shots: draft.shots } })
          setStudioNodeId(null)
          if (action === 'save') {
            toast(`已保存 ${draft.shots.length} 个镜头`, 'success')
            return
          }
          // Batch actions materialise one node per shot; the user still passes
          // through the confirm gate for each generation.
          void batchFromShots(studioNode.id, draft, action === 'batch-video' ? 'video' : 'image')
        }}
      />

      <AssetLibraryPanel
        open={assetLibraryOpen}
        onClose={() => setAssetLibraryOpen(false)}
        onInsert={(asset) => {
          void insertAsset(asset)
          setAssetLibraryOpen(false)
        }}
      />

      <ConfirmGate job={pendingJob} onConfirm={confirmJob} onCancel={cancelJob} onClose={() => setPendingJob(null)} />

      {storyboardConfig && storyboardGroup?.storyboard && (
        <Menu
          anchor={storyboardConfig.anchor}
          onClose={() => setStoryboardConfig(null)}
          width={196}
          sections={[
            {
              title: '画幅',
              items: (['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const).map((ratio) => ({
                id: `aspect-${ratio}`,
                label: ratio,
                checked: storyboardGroup.storyboard?.aspectRatio === ratio,
                onSelect: () =>
                  void commit(
                    [
                      {
                        op: 'updateGroup',
                        groupId: storyboardGroup.id,
                        patch: { storyboard: { ...storyboardGroup.storyboard!, aspectRatio: ratio } },
                      },
                    ],
                    '设置分镜画幅',
                  ),
              })),
            },
            {
              title: '宫格',
              items: [2, 3, 4, 5].map((n) => ({
                id: `grid-${n}`,
                label: `${n}×${n}`,
                checked: storyboardGroup.storyboard?.grid.rows === n,
                onSelect: () =>
                  void commit(
                    [
                      {
                        op: 'updateGroup',
                        groupId: storyboardGroup.id,
                        patch: { storyboard: { ...storyboardGroup.storyboard!, grid: { rows: n, cols: n } } },
                      },
                    ],
                    '设置宫格',
                  ),
              })),
            },
            {
              items: [
                {
                  id: 'sequence',
                  label: '显示序号',
                  checked: storyboardGroup.storyboard?.showSequenceNumbers,
                  onSelect: () =>
                    void commit(
                      [
                        {
                          op: 'updateGroup',
                          groupId: storyboardGroup.id,
                          patch: {
                            storyboard: {
                              ...storyboardGroup.storyboard!,
                              showSequenceNumbers: !storyboardGroup.storyboard!.showSequenceNumbers,
                            },
                          },
                        },
                      ],
                      '切换序号',
                    ),
                },
                {
                  id: 'to-normal',
                  label: '转普通组',
                  onSelect: () =>
                    void commit(
                      [
                        {
                          op: 'updateGroup',
                          groupId: storyboardGroup.id,
                          patch: { kind: 'normal', name: `分组 ${storyboardGroup.nodeIds.length} 个节点` },
                        },
                      ],
                      '转普通组',
                    ),
                },
              ],
            },
          ]}
        />
      )}

      <Toasts />

      {/* Selection hint used by the empty-canvas starter shortcuts */}
      {document.nodes.length === 0 && viewMode === 'workflow' && <EmptyCanvasStarters onPick={usePreset} />}
    </div>
  )
}

function CanvasSelectionBanner({
  kind,
  onBack,
  onExit,
}: {
  kind: 'reference' | 'element'
  onBack: () => void
  onExit: () => void
}) {
  const title = kind === 'reference' ? '从画布选择参考' : '元素选择模式'
  const instruction = kind === 'reference' ? '在当前画布中添加参考' : '点击图片选择局部元素'

  return (
    <div
      data-testid="canvas-selection-banner"
      className="pointer-events-none absolute inset-0 z-[80]"
    >
      <div className="pointer-events-auto absolute top-4 left-1/2 flex h-11 min-w-[520px] -translate-x-1/2 items-center rounded-xl border border-[#6ea4ff]/45 bg-[#1268e8] px-3 text-white shadow-[0_14px_40px_rgba(0,50,145,0.38)]">
        <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/14 text-[15px]">
          {kind === 'reference' ? '↗' : '⌖'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[10px] text-white/65">{instruction}</div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="h-7 rounded-lg bg-white px-3 text-[11px] font-medium text-[#1557bb] hover:bg-[#eef5ff]"
        >
          返回节点
        </button>
        <button
          type="button"
          onClick={onExit}
          className="ml-1.5 h-7 rounded-lg px-3 text-[11px] text-white/80 hover:bg-white/12 hover:text-white"
        >
          退出
        </button>
      </div>

      <div className="absolute top-[76px] left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/68 px-4 py-2 text-[11px] text-white/78 shadow-lg backdrop-blur-md">
        {instruction}
      </div>
    </div>
  )
}

function EmptyCanvasStarters({ onPick }: { onPick: (preset: ToolboxPreset) => void }) {
  const starters = [
    { id: 'preset-shot-breakdown', label: '故事脚本生成', accent: 'from-slate-700/70 via-slate-900 to-black' },
    { id: 'preset-character-turnaround', label: '角色三视图', accent: 'from-rose-950/80 via-zinc-900 to-black' },
    { id: 'preset-first-frame-video', label: '首帧图生视频', accent: 'from-cyan-950/70 via-zinc-900 to-black' },
    { id: 'preset-audio-video', label: '音频生视频', accent: 'from-amber-950/70 via-zinc-900 to-black' },
  ]
  return (
    <div
      data-testid="empty-canvas-starters"
      className="pointer-events-none absolute inset-x-0 bottom-24 top-14 z-10 flex flex-col items-center justify-center gap-6"
    >
      <p className="text-[13px] text-ink-400">双击画布 自由生成节点</p>
      <div className="pointer-events-auto flex max-w-[calc(100%_-_32px)] gap-2 overflow-hidden">
        {starters.map((starter) => {
          const preset = PRESETS_BY_ID.get(starter.id)
          if (!preset) return null
          return (
            <button
              key={starter.id}
              type="button"
              data-testid={`starter-${starter.id}`}
              onClick={() => onPick(preset)}
              className={`group relative flex h-14 w-52 shrink-0 items-center overflow-hidden rounded-lg border border-white/8 bg-gradient-to-r px-3.5 text-left text-[13px] font-medium text-white/88 shadow-[var(--shadow-float)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-white/16 ${starter.accent}`}
            >
              <span className="relative z-10">{starter.label}</span>
              <span className="absolute -right-5 h-20 w-20 rounded-full bg-white/8 blur-xl transition-transform group-hover:scale-125" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CanvasWorkspace(props: { projectId: string; canvasId?: string }) {
  return (
    <ReactFlowProvider>
      <WorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}
