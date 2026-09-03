import type { ScenarioId } from './scenario'

export type LocalApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type LocalApiTag =
  | 'Projects'
  | 'Folders'
  | 'Canvases'
  | 'Workflow'
  | 'Jobs'
  | 'Models'
  | 'Video'
  | 'Assets'
  | 'Agent'
  | 'Skills'
  | 'Publish'
  | 'Ledger'
  | 'Presence'
  | 'Development'

export type LocalApiRoute = {
  method: LocalApiMethod
  path: string
  tag: LocalApiTag
  operationId: string
  uiTriggers: readonly string[]
  scenarios: readonly ScenarioId[]
}

function route(
  method: LocalApiMethod,
  path: string,
  tag: LocalApiTag,
  operationId: string,
  uiTriggers: readonly string[],
  scenarios: readonly ScenarioId[] = ['authenticated-populated'],
): LocalApiRoute {
  return { method, path, tag, operationId, uiTriggers, scenarios }
}

const VIDEO_STATES = [
  'video-awaiting-confirmation',
  'video-queued',
  'video-running',
  'video-succeeded',
  'video-failed',
  'video-cancelled',
  'video-compliance-blocked',
] as const satisfies readonly ScenarioId[]

export const LOCAL_API_ROUTES: readonly LocalApiRoute[] = [
  route('POST', '/api/agent/sessions/{sessionId}/messages', 'Agent', 'sendAgentMessage', ['Agent 输入框发送消息']),
  route('PATCH', '/api/agent/sessions/{sessionId}/messages', 'Agent', 'resolveAgentMessage', [
    '回答 ask_human',
    '确认或拒绝 mutation proposal',
  ]),
  route('GET', '/api/agent/sessions/{sessionId}', 'Agent', 'getAgentSession', ['打开 Agent 会话']),
  route('PATCH', '/api/agent/sessions/{sessionId}', 'Agent', 'updateAgentSession', ['修改 Agent 模型、模式或分享状态']),
  route('DELETE', '/api/agent/sessions/{sessionId}', 'Agent', 'deleteAgentSession', ['Agent 历史菜单删除会话']),
  route('GET', '/api/agent/sessions', 'Agent', 'listAgentSessions', ['打开 Agent 历史']),
  route('POST', '/api/agent/sessions', 'Agent', 'createAgentSession', ['新建 Agent 会话']),

  route('PATCH', '/api/assets/{assetId}', 'Assets', 'updateAsset', ['重命名、移动或修改资产标签']),
  route('DELETE', '/api/assets/{assetId}', 'Assets', 'deleteAsset', ['资产菜单删除']),
  route('GET', '/api/assets/folders', 'Assets', 'listAssetFolders', ['打开资产管理文件夹列表']),
  route('POST', '/api/assets/folders', 'Assets', 'createAssetFolder', ['资产管理新建文件夹']),
  route('GET', '/api/assets', 'Assets', 'listAssets', ['打开个人资产或 Agent 资产标签']),
  route('POST', '/api/assets', 'Assets', 'registerArtifactAsAsset', ['生成结果保存到资产']),
  route('POST', '/api/assets/upload', 'Assets', 'uploadAsset', ['资产管理上传文件']),
  route('DELETE', '/api/assets/upload', 'Assets', 'cancelAssetUpload', ['取消正在上传的资产']),

  route('GET', '/api/canvases/{canvasId}', 'Canvases', 'getCanvas', ['打开或刷新画布'], [
    'authenticated-populated',
    'session-expired',
    'revision-conflict',
    ...VIDEO_STATES,
  ]),
  route('POST', '/api/canvases/{canvasId}', 'Workflow', 'mutateCanvas', [
    '节点、边、分组或视口提交',
    'Video 参考增删、@ token、元素标记或运镜设置',
    'Image 参考增删、风格绑定、预设或派生工具提交',
  ], [
    'authenticated-populated',
    'revision-conflict',
  ]),
  route('PATCH', '/api/canvases/{canvasId}', 'Canvases', 'renameCanvas', ['画布选择器内联重命名']),
  route('DELETE', '/api/canvases/{canvasId}', 'Canvases', 'deleteCanvas', ['画布菜单确认删除']),
  route('POST', '/api/canvases', 'Canvases', 'createCanvas', ['新建画布或创建画布副本']),

  route('POST', '/api/compose', 'Video', 'composeVideo', ['视频合成器导出到本地或画布'], [
    'video-succeeded',
    'video-failed',
  ]),
  route('POST', '/api/dev/reset', 'Development', 'resetActiveScenario', ['Playwright 用例恢复当前 fixture'], [
    'authenticated-empty',
  ]),
  route('GET', '/api/dev/scenario', 'Development', 'getActiveScenario', ['开发场景面板读取当前 fixture'], [
    'authenticated-empty',
  ]),
  route('POST', '/api/dev/scenario', 'Development', 'setActiveScenario', ['开发场景面板切换 fixture'], [
    'authenticated-empty',
  ]),

  route('PATCH', '/api/folders/{folderId}', 'Folders', 'renameFolder', ['项目页文件夹内联重命名']),
  route('DELETE', '/api/folders/{folderId}', 'Folders', 'deleteFolder', ['输入完整文件夹名后永久删除']),
  route('POST', '/api/folders', 'Folders', 'createFolder', ['项目页新建文件夹']),

  route('GET', '/api/home', 'Projects', 'getHomeDiscovery', ['登录态首页初始化'], [
    'anonymous',
    'authenticated-empty',
    'authenticated-populated',
  ]),

  route('GET', '/api/jobs/{jobId}', 'Jobs', 'getGenerationJob', ['节点和详情轮询单个任务'], VIDEO_STATES),
  route('POST', '/api/jobs/{jobId}', 'Jobs', 'transitionGenerationJob', ['确认生成报价或取消已有任务'], VIDEO_STATES),
  route('GET', '/api/jobs', 'Jobs', 'listGenerationJobs', ['历史记录和画布初始化任务列表'], VIDEO_STATES),
  route('POST', '/api/jobs', 'Jobs', 'createGenerationJob', ['节点点击生成并创建报价'], [
    'authenticated-populated',
    'video-awaiting-confirmation',
  ]),
  route('GET', '/api/ledger', 'Ledger', 'listLedgerEntries', ['账户积分余额与明细'], [
    'authenticated-populated',
    ...VIDEO_STATES,
  ]),
  route('GET', '/api/media/{path}', 'Assets', 'readLocalMedia', ['图片、视频和音频播放器读取本地 fixture'], [
    'authenticated-populated',
    'public-showcase',
    ...VIDEO_STATES,
  ]),
  route('GET', '/api/models', 'Models', 'listModels', ['打开模型目录', '搜索或筛选模型'], [
    'anonymous',
    'authenticated-populated',
  ]),
  route('GET', '/api/presence/{canvasId}', 'Presence', 'getCanvasPresence', ['画布协作者和跟随状态']),
  route('POST', '/api/presence/{canvasId}', 'Presence', 'updateCanvasPresence', ['光标、视口、跟随和编辑租约心跳'], [
    'authenticated-populated',
    'session-expired',
  ]),
  route('GET', '/api/preview/character', 'Assets', 'previewCharacterReference', ['角色库参考图预览']),
  route('GET', '/api/preview/stitch', 'Assets', 'previewStoryboardStitch', ['分镜组 2K 拼接预览']),

  route('GET', '/api/projects/{projectId}', 'Projects', 'getProject', ['从项目卡打开工作台'], [
    'authenticated-populated',
    'session-expired',
    ...VIDEO_STATES,
  ]),
  route('PATCH', '/api/projects/{projectId}', 'Projects', 'updateProject', ['项目重命名、移动或修改封面']),
  route('DELETE', '/api/projects/{projectId}', 'Projects', 'deleteProject', ['项目菜单确认删除']),
  route('PUT', '/api/projects/{projectId}', 'Projects', 'duplicateProject', ['项目菜单创建副本']),
  route('GET', '/api/projects', 'Projects', 'listProjects', ['首页最近项目与全部项目页'], [
    'authenticated-empty',
    'authenticated-populated',
  ]),
  route('POST', '/api/projects', 'Projects', 'createProject', ['首页开始创作与项目页开始创作'], [
    'authenticated-empty',
    'authenticated-populated',
  ]),

  route('GET', '/api/publish/{snapshotId}', 'Publish', 'getPublishedSnapshot', ['TV Show 查看制作过程'], [
    'public-showcase',
  ]),
  route('DELETE', '/api/publish/{snapshotId}', 'Publish', 'revokePublishedSnapshot', ['个人中心下架作品'], [
    'public-showcase',
  ]),
  route('GET', '/api/publish', 'Publish', 'listPublishedSnapshots', ['TV Show 作品流'], [
    'anonymous',
    'public-showcase',
  ]),
  route('POST', '/api/publish', 'Publish', 'publishCanvas', ['发布与分享菜单发布作品']),

  route('GET', '/api/skills/{skillId}', 'Skills', 'getSkill', ['打开 Skill 详情']),
  route('POST', '/api/skills/{skillId}', 'Skills', 'toggleSkillFavorite', ['Skill 卡或详情收藏']),
  route('GET', '/api/skills', 'Skills', 'listSkills', ['首页推荐与 Skill 市场'], [
    'anonymous',
    'authenticated-populated',
  ]),
] as const
