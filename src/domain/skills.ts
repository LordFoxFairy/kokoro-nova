/**
 * Skill catalogue.
 *
 * A Skill is a *versioned capability pack*: a written execution contract an
 * agent loads, not a prompt snippet it pastes. The contract is the product —
 * two runs of the same version have to follow the same steps and hand back the
 * same shape — so `executableSpec` is structured prose with named sections, and
 * the version belongs to a skill's identity rather than to its metadata.
 *
 * Catalogue rows are immutable seed data and deliberately carry no favourite
 * flag: whether a reader starred a skill is per-space user state kept in the
 * workspace store (see src/server/skills.ts). Folding it in here would make one
 * shared catalogue read differently per reader, and every filtering helper below
 * would have to be re-derived per request.
 *
 * Cover art is generated from `hue` exactly like the other libraries do it (see
 * src/domain/libraries.ts), so the catalogue ships no image files.
 */

export const SKILL_CATEGORIES = [
  '全部',
  '叙事分镜',
  '角色一致性',
  '广告文案',
  '提示词工程',
  '声音与配乐',
  '交付规范',
] as const

/** Includes 全部, which is a filter value rather than something a skill can be. */
export type SkillCategoryFilter = (typeof SKILL_CATEGORIES)[number]
export type SkillCategory = Exclude<SkillCategoryFilter, '全部'>

export const SKILL_COLLECTIONS = ['全部', '收藏', '我的'] as const
export type SkillCollection = (typeof SKILL_COLLECTIONS)[number]

/**
 * `personal` is what 我的 selects on. It is authorship, not possession: a
 * favourited skill still belongs to whoever wrote it.
 */
export type SkillOrigin = 'official' | 'community' | 'personal'

/** One named part of the contract. Order is meaningful — it is read top down. */
export interface SkillSpecSection {
  heading: string
  body: string
}

export interface Skill {
  id: string
  name: string
  summary: string
  category: SkillCategory
  author: string
  origin: SkillOrigin
  /** Loading a skill pins this exact version; a new version is a new contract. */
  version: string
  /** Plain `YYYY-MM-DD`: it is displayed verbatim, never re-zoned. */
  updatedAt: string
  hue: number
  usageCount: number
  tags: string[]
  /** Sentences a user would actually type to invoke it. */
  examples: string[]
  executableSpec: SkillSpecSection[]
}

/** A catalogue row projected for one reader: the row plus that reader's star. */
export type SkillCard = Skill & { favourite: boolean }

export const SKILL_CATALOGUE: Skill[] = [
  {
    id: 'skill-storyboard-breakdown',
    name: '分镜拆解',
    summary: '把一段文字脚本拆成带镜号、景别、时长与画面描述的镜头表，并把总时长对齐到目标。',
    category: '叙事分镜',
    author: 'Lib 官方',
    origin: 'official',
    version: '2.4.0',
    updatedAt: '2026-06-18',
    hue: 212,
    usageCount: 186_200,
    tags: ['脚本', '镜头表', '节奏'],
    examples: [
      '把这段 200 字的产品文案拆成 12 个镜头，总时长 30 秒',
      '按三幕结构重新拆解当前脚本节点，每镜不超过 5 秒',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '会话中存在脚本、文本节点或用户贴入的正文，并且诉求是「拆分镜 / 出镜头表」。没有可拆的正文时先索取，不要替用户编造剧情。',
      },
      {
        heading: '需要的输入',
        body: '脚本正文；目标总时长；成片比例；可用角色与场景清单。画布上已有角色节点时直接引用节点 id，不要重新描述角色外观。',
      },
      {
        heading: '执行步骤',
        body: '① 按语义切分叙事单元，一个单元只承载一件事。② 为每个单元分配景别与时长，单镜时长落在 1.5–6 秒。③ 补全画面主体、动作、环境、光线与情绪。④ 回填总时长，与目标偏差控制在 ±5% 以内。',
      },
      {
        heading: '输出格式',
        body: '一张镜头表，每行为：镜号 / 景别 / 时长 / 画面描述 / 台词或旁白 / 备注。表尾附一行校验：镜头数、累计时长、与目标时长的偏差。',
      },
      {
        heading: '约束',
        body: '不改写原文的事实与卖点；镜号连续不跳号；同一角色在所有镜号中用同一个称呼；旁白逐字保留，不做同义替换。',
      },
      {
        heading: '失败与回退',
        body: '目标时长装不下全部叙事单元时，先输出建议删减的镜号与理由，等用户确认后再给终表——不要静默砍内容。',
      },
    ],
  },
  {
    id: 'skill-shotlist-to-prompts',
    name: '镜头表转提示词',
    summary: '把镜头表逐行翻译成可直接投喂图像/视频模型的提示词，并按模型能力拆分正负向描述。',
    category: '提示词工程',
    author: 'Lib 官方',
    origin: 'official',
    version: '1.9.2',
    updatedAt: '2026-06-30',
    hue: 268,
    usageCount: 142_800,
    tags: ['提示词', '批量', '模型适配'],
    examples: [
      '把这张镜头表转成 12 条首帧图提示词',
      '按视频模型的写法重写第 4–7 镜的提示词，保留运镜描述',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '已经存在镜头表（本会话生成或用户贴入），诉求是拿到可以直接生成的提示词。只有零散想法时先走「分镜拆解」。',
      },
      {
        heading: '需要的输入',
        body: '镜头表；目标模型 id；输出比例与分辨率；风格节点或参考图（若画布上已连线则直接沿用，不另起风格）。',
      },
      {
        heading: '执行步骤',
        body: '① 逐行读取镜号，提取主体、动作、环境、光线、镜头语言五要素。② 按目标模型的偏好排序要素——图像模型主体前置，视频模型动作与运镜前置。③ 补齐风格与画质词，来源必须是已连线的风格节点。④ 生成负向提示词，只写本镜真正需要排除的内容。',
      },
      {
        heading: '输出格式',
        body: '与镜头表同序的提示词清单，每条含：镜号 / 正向提示词 / 负向提示词 / 建议模型 / 比例。一镜一条，不合并。',
      },
      {
        heading: '约束',
        body: '不引入镜头表里没有的元素；不堆砌无差别的画质词；同一角色的外观描述在所有镜次逐字一致，避免模型漂移。',
      },
    ],
  },
  {
    id: 'skill-character-consistency',
    name: '角色一致性',
    summary: '为角色建立一份逐字复用的外观描述，并在整条片子的每次生成中锁定它。',
    category: '角色一致性',
    author: 'Lib 官方',
    origin: 'official',
    version: '3.2.1',
    updatedAt: '2026-07-02',
    hue: 342,
    usageCount: 205_600,
    tags: ['角色', '三视图', '锁定'],
    examples: [
      '为女主建立角色描述，并应用到全部 18 个镜头',
      '检查第 9 镜的人物是否和三视图一致',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '同一角色需要出现在两个以上镜头，或用户报告「人物长得不一样」。单镜生成不需要加载本 Skill。',
      },
      {
        heading: '需要的输入',
        body: '角色参考图（优先三视图与脸部近景）；角色姓名；出场镜号范围。参考图缺失时先产出三视图再继续。',
      },
      {
        heading: '执行步骤',
        body: '① 从参考图提取身份锚点：脸型、五官比例、发型发色、肤色、体型。② 提取可变项：服装、配饰、妆造、状态。③ 把身份锚点写成一段不超过 60 字的定长描述，作为角色卡。④ 在每一次生成中把角色卡逐字前置，可变项跟在其后。',
      },
      {
        heading: '输出格式',
        body: '一张角色卡（身份锚点定长描述 + 可变项清单 + 参考图引用），以及一份「镜号 → 该镜使用的可变项」对照表。',
      },
      {
        heading: '约束',
        body: '身份锚点一旦确定，本片内不再改写——需要改先改角色卡再重跑受影响镜号。可变项不得写进身份锚点，否则会把服装也一起锁死。',
      },
      {
        heading: '失败与回退',
        body: '参考图之间本身矛盾（例如发色不同）时停下来指出矛盾点，让用户选定一张作为基准，不要自行取平均。',
      },
    ],
  },
  {
    id: 'skill-ad-script-structure',
    name: '广告脚本结构',
    summary: '按「痛点—转折—卖点—行动」把创意收敛成可拍的广告脚本，并标出每段的时长预算。',
    category: '广告文案',
    author: 'Lib 官方',
    origin: 'official',
    version: '2.1.0',
    updatedAt: '2026-05-27',
    hue: 28,
    usageCount: 97_400,
    tags: ['广告', '结构', '卖点'],
    examples: [
      '把这三个卖点写成 30 秒广告脚本',
      '这版脚本行动召唤太弱，按结构重排',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '目标是投放向的短片：有明确的产品、受众与投放时长。品牌形象片、剧情片不适用本结构。',
      },
      {
        heading: '需要的输入',
        body: '产品与核心卖点（最多三条）；目标受众；投放时长；品牌禁用词与必用词；行动召唤的落点。',
      },
      {
        heading: '执行步骤',
        body: '① 用受众语言复述痛点，不用产品术语。② 设计一个转折点，让产品在此处第一次出现。③ 逐条兑现卖点，每条配一个可拍的画面证据。④ 收在单一行动召唤上，只给一个动作。',
      },
      {
        heading: '时长预算',
        body: '15 秒档：痛点 3s / 转折 2s / 卖点 7s / 召唤 3s。30 秒档：5s / 4s / 15s / 6s。偏差超过 1 秒要在输出里注明原因。',
      },
      {
        heading: '输出格式',
        body: '四段式脚本，每段含：段落名 / 时长 / 画面 / 台词或字幕 / 该段要让观众记住的一句话。',
      },
      {
        heading: '约束',
        body: '卖点不超过三条——第四条会稀释前三条；不写无法拍摄的抽象画面；禁用词一次都不能出现，包括字幕。',
      },
    ],
  },
  {
    id: 'skill-hook-first-three-seconds',
    name: '前三秒钩子',
    summary: '只改开头三秒：给出五个可拍的钩子方案，并说明各自赌的是什么。',
    category: '广告文案',
    author: '社区',
    origin: 'community',
    version: '1.5.3',
    updatedAt: '2026-06-09',
    hue: 12,
    usageCount: 88_900,
    tags: ['开头', '完播率', '备选'],
    examples: [
      '给这条片子换五个开头，别动后面的内容',
      '现在的开头太平，来点冲突感更强的',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '已有完整脚本或成片，问题被限定在开头。整体叙事不成立时不要用本 Skill 去补救。',
      },
      {
        heading: '需要的输入',
        body: '现有开头的画面与台词；片子的核心承诺；投放场景（信息流 / 详情页 / 前贴片）。',
      },
      {
        heading: '执行步骤',
        body: '① 提取片子的核心承诺，钩子必须与它同向，不能骗点击。② 沿五条路径各出一个方案：反常画面、直给结论、提问、对比、身份点名。③ 每个方案写成一句画面描述加一句台词，控制在 3 秒内说完。④ 标注每个方案赌的是什么、对什么受众失效。',
      },
      {
        heading: '输出格式',
        body: '五个方案的对照表：路径 / 画面 / 台词 / 赌注 / 失效人群。不排名——排名要靠投放数据，不是靠判断。',
      },
      {
        heading: '约束',
        body: '不改动第 3 秒之后的任何内容；台词不超过 12 个字；不使用与正片无关的猎奇画面。',
      },
    ],
  },
  {
    id: 'skill-continuity-check',
    name: '连贯性巡检',
    summary: '在生成之前把镜头表过一遍，找出光线、方位、服装与时间线上接不上的地方。',
    category: '叙事分镜',
    author: '社区',
    origin: 'community',
    version: '1.3.1',
    updatedAt: '2026-06-21',
    hue: 190,
    usageCount: 54_300,
    tags: ['校验', '轴线', '前置检查'],
    examples: [
      '生成前先巡检一遍这 18 个镜头',
      '第 6 镜到第 7 镜好像跳轴了，帮我确认',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '镜头表已定稿、还没开始批量生成时运行一次。生成之后再跑只能用来定位问题，省不下重跑的成本。',
      },
      {
        heading: '检查项',
        body: '光线方向与色温是否在同场景内漂移；主体运动方向是否跨过 180 度轴线；服装、道具、发型是否在同一时间段内变化；昼夜与天气是否与时间线冲突；同一空间的陈设是否前后矛盾。',
      },
      {
        heading: '执行步骤',
        body: '① 按场景把镜号分组，跨组不比较。② 组内逐项比对上述检查项。③ 每处冲突给出涉及镜号、冲突类型与一句可执行的修法。',
      },
      {
        heading: '输出格式',
        body: '问题清单，按严重度排序：致命（观众必然察觉）/ 明显 / 可接受。没有问题时明确回答「未发现冲突」，并列出已检查的项目，不要沉默通过。',
      },
      {
        heading: '约束',
        body: '只报告与修法，不直接改镜头表——改动要由用户决定，因为有些冲突是刻意的。',
      },
    ],
  },
  {
    id: 'skill-camera-language',
    name: '运镜语言映射',
    summary: '把「想要的感觉」翻译成具体的机位、焦段与运动，并写成模型能听懂的运镜描述。',
    category: '提示词工程',
    author: 'Lib 官方',
    origin: 'official',
    version: '1.7.0',
    updatedAt: '2026-05-30',
    hue: 200,
    usageCount: 76_500,
    tags: ['运镜', '机位', '镜头语言'],
    examples: [
      '这段想要压迫感，给我具体的机位和运镜',
      '把「跟着他走」写成模型能理解的运镜描述',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '用户用感受性词汇描述镜头（压迫、轻盈、紧张、辽阔），需要落到可执行的机位参数。',
      },
      {
        heading: '映射规则',
        body: '压迫感 → 低机位仰拍 + 广角贴近 + 缓慢推进；辽阔 → 高机位俯拍 + 长焦压缩 + 横移；紧张 → 手持 + 中近景 + 不规则微抖；亲密 → 平视 + 中长焦 + 固定；失控 → 第一人称 + 快速穿行。',
      },
      {
        heading: '执行步骤',
        body: '① 归一化感受词到上表中的一类，落不进任何一类时向用户确认，不要硬套。② 输出机位高度、角度、焦段、运动方式、运动速度五项参数。③ 用一句话把五项参数写成模型可读的运镜描述，动作在前、速度在后。',
      },
      {
        heading: '输出格式',
        body: '每镜一组：感受词 / 机位高度 / 角度 / 焦段 / 运动 / 速度 / 可直接投喂的运镜句。',
      },
      {
        heading: '约束',
        body: '一个镜头只给一种主要运动，复合运动交给剪辑点解决；速度用「缓慢 / 匀速 / 快速」三档，不写具体秒速——模型对数值不敏感。',
      },
    ],
  },
  {
    id: 'skill-voice-direction',
    name: '配音断句与情绪标注',
    summary: '把旁白稿标成可直接朗读的脚本：断句、停顿时长、重音与情绪，并预估时长。',
    category: '声音与配乐',
    author: 'Lib 官方',
    origin: 'official',
    version: '1.4.2',
    updatedAt: '2026-06-14',
    hue: 288,
    usageCount: 63_100,
    tags: ['旁白', '断句', '时长'],
    examples: [
      '把这段旁白标好停顿和重音，控制在 22 秒',
      '这段读起来太赶，重新断句',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '存在旁白或台词文本，需要合成语音或交给配音员。纯字幕不需要断句标注。',
      },
      {
        heading: '需要的输入',
        body: '旁白正文；目标时长；音色倾向；语速偏好；需要与画面对齐的关键时间点。',
      },
      {
        heading: '执行步骤',
        body: '① 按语义断句，单句不超过 18 个字。② 在句间标注停顿时长，取 0.25 / 0.5 / 1 / 1.5 秒四档。③ 每句标一个重音词，只标一个。④ 每段标一个情绪标签。⑤ 按每分钟 240 字估算时长并与目标比对。',
      },
      {
        heading: '输出格式',
        body: '带标记的朗读稿：`|` 表示断句，`[停 0.5]` 表示停顿，`**重音**` 标重音，段首用「（情绪：坚定）」。末尾给出预估时长与偏差。',
      },
      {
        heading: '约束',
        body: '不改写原文用词，只加标记；停顿总时长不超过全片时长的 15%；关键时间点必须落在断句边界上，不能落在词中间。',
      },
    ],
  },
  {
    id: 'skill-bgm-beat-map',
    name: '音乐卡点表',
    summary: '按音乐结构给出卡点时间轴，标出该在哪一帧切镜、哪一段留白。',
    category: '声音与配乐',
    author: '社区',
    origin: 'community',
    version: '0.9.4',
    updatedAt: '2026-07-05',
    hue: 305,
    usageCount: 41_700,
    tags: ['卡点', 'BGM', '剪辑'],
    examples: [
      '这条 30 秒的片子按 120 BPM 出一份卡点表',
      '副歌进来的地方要切到产品特写，帮我排时间轴',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '成片时长已确定、且剪辑要跟着音乐走。音乐尚未选定时先给 BPM 区间建议，不要硬排时间轴。',
      },
      {
        heading: '需要的输入',
        body: '成片时长；BPM 或音乐段落结构（前奏 / 主歌 / 副歌 / 尾奏）；必须落在重拍上的镜号。',
      },
      {
        heading: '执行步骤',
        body: '① 由 BPM 推每拍时长，四拍成一小节。② 把音乐段落边界对齐到小节线。③ 在段落边界安排切镜，段落内部每两小节允许一次切镜。④ 为副歌前一小节留一个停顿点，给画面一次呼吸。',
      },
      {
        heading: '输出格式',
        body: '时间轴表：时间码 / 小节 / 音乐段落 / 建议动作（切镜 / 保持 / 留白）/ 对应镜号。',
      },
      {
        heading: '约束',
        body: '同一段落内切镜间隔不小于 0.8 秒，否则观众读不完画面；留白点不得安排信息量大的镜头。',
      },
    ],
  },
  {
    id: 'skill-delivery-spec',
    name: '交付规格校验',
    summary: '按交付清单核对成片：分辨率、比例、时长、字幕安全区与音量，逐项给结论。',
    category: '交付规范',
    author: 'Lib 官方',
    origin: 'official',
    version: '2.3.0',
    updatedAt: '2026-06-25',
    hue: 156,
    usageCount: 58_400,
    tags: ['交付', '校验', '安全区'],
    examples: [
      '按竖版信息流的规格校验这条成片',
      '字幕会不会被界面挡住？帮我核一遍安全区',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '成片已合成、准备交付或导出前运行。中间稿不需要，规格问题在定稿前修更便宜。',
      },
      {
        heading: '需要的输入',
        body: '成片的分辨率、比例、时长、码率；目标投放位的规格要求；字幕与角标的位置。',
      },
      {
        heading: '检查项',
        body: '分辨率不低于要求；比例完全相等而非近似；时长落在允许区间；字幕与关键信息在上下各 10%、左右各 5% 的安全区之内；首帧不是黑场；音频响度在 -16 至 -12 LUFS。',
      },
      {
        heading: '输出格式',
        body: '逐项结论表：检查项 / 要求值 / 实际值 / 通过与否 / 不通过时的修法。末尾给出总体结论：可交付 / 需返修。',
      },
      {
        heading: '约束',
        body: '任何一项拿不到实际值就标注「未知」并要求补充，不得用「应该没问题」代替结论。',
      },
    ],
  },
  {
    id: 'skill-multi-ratio-repack',
    name: '多比例改版',
    summary: '把一条横版成片改成竖版与方版：重新裁切、重排字幕，并指出必须重拍的镜头。',
    category: '交付规范',
    author: '社区',
    origin: 'community',
    version: '1.1.2',
    updatedAt: '2026-07-08',
    hue: 168,
    usageCount: 47_900,
    tags: ['改版', '裁切', '竖版'],
    examples: [
      '把这条 16:9 的片子改成 9:16',
      '哪些镜头竖过来会废掉？',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '同一支片子要投放到不同比例的位置，且原素材是单一比例。多机位素材优先用原生比例，不走本 Skill。',
      },
      {
        heading: '需要的输入',
        body: '原片比例与镜头表；目标比例；每镜的主体位置；字幕与角标层。',
      },
      {
        heading: '执行步骤',
        body: '① 逐镜判定主体是否落在目标比例的可视区内。② 可保留的镜头给出裁切锚点（居中 / 跟随主体 / 固定偏移）。③ 主体溢出或多人同框的镜头标为「需重拍」，并给出重拍时的构图建议。④ 字幕整体下移到新的安全区，行宽按目标比例重排。',
      },
      {
        heading: '输出格式',
        body: '逐镜改版表：镜号 / 处理方式（裁切 / 重拍 / 重构图）/ 裁切锚点 / 字幕位置变化 / 备注。末尾汇总需重拍镜头数与预估成本。',
      },
      {
        heading: '约束',
        body: '不用拉伸变形来凑比例；不靠模糊背景填充来掩盖构图问题——那会让画面看起来像二次加工。',
      },
    ],
  },
  {
    id: 'skill-wardrobe-prop-bible',
    name: '服装道具设定表',
    summary: '我自己整理的一套设定表模板：按场次锁定服装、道具与妆造，避免中途换装穿帮。',
    category: '角色一致性',
    author: '我',
    origin: 'personal',
    version: '0.4.1',
    updatedAt: '2026-07-11',
    hue: 48,
    usageCount: 320,
    tags: ['设定表', '服装', '道具'],
    examples: [
      '按场次整理这部短片的服装道具设定表',
      '第二场换了外套，帮我把设定表更新一遍',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '片子有两场以上、且角色会换装或携带关键道具时使用。单场短片直接写进角色卡即可。',
      },
      {
        heading: '需要的输入',
        body: '场次划分；每场的时间与地点；角色出场表；剧情中必须出现的道具。',
      },
      {
        heading: '执行步骤',
        body: '① 建立场次轴，标注每场的故事时间。② 逐场登记角色的上衣、下装、鞋、配饰、妆造五项。③ 登记道具的持有人与出现场次。④ 检查跨场变化是否有剧情解释，没有的标红。',
      },
      {
        heading: '输出格式',
        body: '两张表：服装表（场次 × 角色 × 五项）与道具表（道具 / 持有人 / 出现场次 / 状态变化）。变化处高亮，无解释的变化单独列一节。',
      },
      {
        heading: '约束',
        body: '道具的状态变化是单向的——破损、消耗过的道具不能在后续场次恢复原状，除非剧情倒叙。',
      },
    ],
  },
  {
    id: 'skill-brand-tone-guard',
    name: '品牌口径守卫',
    summary: '我自己的口径清单：生成前后各过一遍文案，拦住禁用词、夸大表述与错误的品牌写法。',
    category: '广告文案',
    author: '我',
    origin: 'personal',
    version: '0.7.0',
    updatedAt: '2026-07-14',
    hue: 96,
    usageCount: 615,
    tags: ['合规', '口径', '文案'],
    examples: [
      '这版文案过一遍口径检查',
      '把所有出现品牌名的地方按规范写法统一',
    ],
    executableSpec: [
      {
        heading: '触发条件',
        body: '任何要对外露出的文字——台词、字幕、标题、角标——在定稿前运行一次。内部沟通稿不必。',
      },
      {
        heading: '需要的输入',
        body: '品牌名的规范写法；禁用词表；必用的说明性表述；本次投放的地区与渠道。',
      },
      {
        heading: '检查项',
        body: '品牌名大小写与空格是否与规范逐字一致；禁用词及其变体是否出现；是否使用了绝对化表述；功效类表述是否有对应的说明性附注；数字与单位是否与事实一致。',
      },
      {
        heading: '执行步骤',
        body: '① 全文扫描，逐条命中记录位置与原文。② 每处给出替换建议，保持原句节奏与字数接近。③ 无法在不改变含义的前提下替换时，标为「需人工决策」。',
      },
      {
        heading: '输出格式',
        body: '问题清单：位置 / 原文 / 命中规则 / 建议改法 / 是否需人工决策。末尾给出可直接使用的修订全文。',
      },
      {
        heading: '约束',
        body: '只改被规则命中的地方，不顺手润色其它句子——那会让人无法核对改了什么。',
      },
    ],
  },
]

const SKILL_BY_ID = new Map(SKILL_CATALOGUE.map((skill) => [skill.id, skill]))

export function findSkill(skillId: string): Skill | undefined {
  return SKILL_BY_ID.get(skillId)
}

/* ------------------------------------------------------------------ *
 * Pure filtering
 * ------------------------------------------------------------------ */

/** 全部 passes everything through; an unknown category matches nothing. */
export function skillsByCategory(skills: readonly Skill[], category: string): Skill[] {
  if (category === '全部') return [...skills]
  return skills.filter((skill) => skill.category === category)
}

/**
 * Substring match over the fields a reader can see on a card, so a query that
 * visibly matches a card never filters it away. Blank queries pass everything —
 * an empty search box is not a filter.
 */
export function searchSkills(skills: readonly Skill[], query: string): Skill[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...skills]
  return skills.filter((skill) =>
    [skill.name, skill.summary, skill.author, skill.category, ...skill.tags].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  )
}

/**
 * Favourites projection.
 *
 * Order comes from the catalogue, not from the id list: the star list is in the
 * order things were starred, and a grid that reshuffles whenever a card is
 * re-starred is unreadable. Ids with no catalogue row are dropped rather than
 * erroring — a skill can leave the catalogue while a star still points at it.
 */
export function favouriteSkills(skills: readonly Skill[], favouriteIds: readonly string[]): Skill[] {
  const starred = new Set(favouriteIds)
  return skills.filter((skill) => starred.has(skill.id))
}

export function isFavourite(favouriteIds: readonly string[], skillId: string): boolean {
  return favouriteIds.includes(skillId)
}

/**
 * Set semantics, not a flip: the caller states the state it wants, so a retried
 * or duplicated request lands on the same result. Always returns a new array —
 * the input may be the persisted list and must not be mutated in place.
 */
export function applyFavourite(
  favouriteIds: readonly string[],
  skillId: string,
  favourite: boolean,
): string[] {
  if (!favourite) return favouriteIds.filter((id) => id !== skillId)
  if (favouriteIds.includes(skillId)) return [...favouriteIds]
  return [...favouriteIds, skillId]
}

export interface SkillQuery {
  category?: string | null
  query?: string | null
  collection?: string | null
  favouriteIds?: readonly string[]
}

/** Narrow a query-string value to a real category; anything else means 全部. */
export function parseSkillCategory(value: string | null | undefined): SkillCategoryFilter {
  return (SKILL_CATEGORIES as readonly string[]).includes(value ?? '')
    ? (value as SkillCategoryFilter)
    : '全部'
}

export function parseSkillCollection(value: string | null | undefined): SkillCollection {
  return (SKILL_COLLECTIONS as readonly string[]).includes(value ?? '')
    ? (value as SkillCollection)
    : '全部'
}

/**
 * Collection → category → query, in that order: the collection decides *which
 * catalogue* you are browsing, and the other two narrow inside it. Running them
 * the other way round would let a category with no favourites report "没有收藏"
 * when the real answer is "这个分类下没有收藏".
 */
export function selectSkills(skills: readonly Skill[], input: SkillQuery = {}): Skill[] {
  const collection = parseSkillCollection(input.collection)
  let rows: Skill[] = [...skills]
  if (collection === '收藏') rows = favouriteSkills(rows, input.favouriteIds ?? [])
  if (collection === '我的') rows = rows.filter((skill) => skill.origin === 'personal')
  rows = skillsByCategory(rows, parseSkillCategory(input.category))
  return searchSkills(rows, input.query ?? '')
}

/**
 * Attach one reader's stars. Returns fresh objects: the catalogue is module-level
 * shared state and a favourite written onto it would leak across readers.
 */
export function toSkillCards(skills: readonly Skill[], favouriteIds: readonly string[]): SkillCard[] {
  const starred = new Set(favouriteIds)
  return skills.map((skill) => ({ ...skill, favourite: starred.has(skill.id) }))
}
