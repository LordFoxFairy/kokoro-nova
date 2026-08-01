/**
 * Scene model and projection maths for 导演台 (the shot-blocking editor).
 *
 * World space is metres: +x right, +y up, +z forward. Yaw is in degrees, taken
 * clockwise when seen from above with 0 pointing along +z — so a camera's
 * forward vector is `(sin yaw, 0, cos yaw)` and its right vector is
 * `(cos yaw, 0, -sin yaw)`.
 *
 * Every function here is pure and side-effect free. The top-down map and the
 * camera preview are both driven from this one file on purpose: if the two
 * views disagreed, the blocking a director produced here would be a lie by the
 * time a downstream image node consumed it.
 */

import { newId } from '@/domain/ids'

/* ------------------------------------------------------------------ *
 * Core types
 * ------------------------------------------------------------------ */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A point on the ground plane; `y` is implied to be 0. */
export interface GroundPoint {
  x: number
  z: number
}

export interface Size3 {
  w: number
  d: number
  h: number
}

export interface Camera {
  id: string
  name: string
  position: Vec3
  /** Yaw in degrees. Ignored while `lookAtActorId` is set — see `resolveCamera`. */
  rotationY: number
  /** Horizontal field of view in degrees; the vertical one falls out of the aspect. */
  fov: number
  aspectRatio: AspectRatioId
  lookAtActorId: string | null
}

export interface Actor {
  id: string
  name: string
  position: Vec3
  rotationY: number
  pose: PoseId
  /** Full standing height in metres, used to scale the stick figure. */
  height: number
}

export interface Prop {
  id: string
  name: string
  position: Vec3
  rotationY: number
  size: Size3
  kind: PropKind
}

export interface DirectorScene {
  cameras: Camera[]
  actors: Actor[]
  props: Prop[]
  activeCameraId: string
}

/**
 * A framing frozen for later reuse. The camera is stored fully resolved (yaw
 * baked in, look-at dropped) because a "captured shot" means the exact framing
 * the director saw, not a rule that keeps re-aiming as actors wander off.
 */
export interface CapturedShot {
  id: string
  name: string
  camera: Camera
  createdAt: string
  note?: string
}

export type SelectionKind = 'camera' | 'actor' | 'prop'

export interface SceneSelection {
  kind: SelectionKind
  id: string
}

/* ------------------------------------------------------------------ *
 * Aspect ratios
 * ------------------------------------------------------------------ */

export type AspectRatioId = 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'

export interface AspectRatioOption {
  id: AspectRatioId
  label: string
  value: number
}

/** `自动` previews at 16:9 but leaves the final crop to the consuming node. */
export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: 'auto', label: '自动', value: 16 / 9 },
  { id: '21:9', label: '21:9', value: 21 / 9 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
]

const ASPECT_BY_ID = new Map(ASPECT_RATIOS.map((option) => [option.id, option]))

export function aspectValue(id: AspectRatioId): number {
  return ASPECT_BY_ID.get(id)?.value ?? 16 / 9
}

/* ------------------------------------------------------------------ *
 * Props catalogue
 * ------------------------------------------------------------------ */

export type PropKind =
  | 'box'
  | 'table'
  | 'chair'
  | 'door'
  | 'pillar'
  | 'vehicle'
  | 'tree'
  | 'wall'
  | 'stair'
  | 'light'

export interface PropKindOption {
  id: PropKind
  label: string
  size: Size3
}

export const PROP_KINDS: PropKindOption[] = [
  { id: 'box', label: '箱体', size: { w: 0.6, d: 0.6, h: 0.6 } },
  { id: 'table', label: '桌台', size: { w: 1.8, d: 0.9, h: 0.75 } },
  { id: 'chair', label: '座椅', size: { w: 0.5, d: 0.52, h: 0.9 } },
  { id: 'door', label: '门框', size: { w: 1.0, d: 0.16, h: 2.1 } },
  { id: 'pillar', label: '立柱', size: { w: 0.45, d: 0.45, h: 3.2 } },
  { id: 'vehicle', label: '车辆', size: { w: 1.85, d: 4.4, h: 1.45 } },
  { id: 'tree', label: '树木', size: { w: 2.2, d: 2.2, h: 4.6 } },
  { id: 'wall', label: '墙体', size: { w: 4, d: 0.25, h: 2.8 } },
  { id: 'stair', label: '台阶', size: { w: 2.4, d: 1.2, h: 0.6 } },
  { id: 'light', label: '灯具', size: { w: 0.5, d: 0.5, h: 2.0 } },
]

const PROP_KIND_BY_ID = new Map(PROP_KINDS.map((kind) => [kind.id, kind]))

export function propKindLabel(kind: PropKind): string {
  return PROP_KIND_BY_ID.get(kind)?.label ?? kind
}

export function propKindSize(kind: PropKind): Size3 {
  const size = PROP_KIND_BY_ID.get(kind)?.size ?? { w: 0.6, d: 0.6, h: 0.6 }
  return { ...size }
}

/* ------------------------------------------------------------------ *
 * Pose presets
 * ------------------------------------------------------------------ */

export type PoseId =
  | 'stand'
  | 'walk'
  | 'run'
  | 'sit'
  | 'crouch'
  | 'jump'
  | 'lean'
  | 'lookBack'
  | 'wave'
  | 'point'
  | 'hold'
  | 'talk'
  | 'think'
  | 'surprise'
  | 'guard'
  | 'fallen'
  | 'climb'
  | 'dance'
  | 'bow'
  | 'salute'
  | 'kneel'
  | 'aim'
  | 'reach'
  | 'push'
  | 'celebrate'

export type PoseCategory = '静止' | '移动' | '交互' | '情绪' | '战斗'

export const POSE_CATEGORIES: PoseCategory[] = ['静止', '移动', '交互', '情绪', '战斗']

/**
 * A skeleton is described by joint angles rather than joint coordinates: it
 * stays readable when tuning a pose by hand, and forward kinematics guarantees
 * limb lengths stay constant so no pose can silently stretch a figure.
 *
 * Limb angles are `[upper, lower]` in degrees measured from straight down, with
 * positive swinging toward the character's front. The lower value is applied on
 * top of the upper one, so a negative knee value bends the leg backwards — the
 * only direction a knee actually goes.
 */
export interface PoseSkeleton {
  /** Pelvis height above the contact point, as a fraction of body height. */
  hip: number
  /** Spine tilt in degrees; positive leans forward. */
  lean: number
  /** Spine tilt toward the character's right, in degrees. */
  sway?: number
  /** Positive looks down. */
  headPitch?: number
  /** Positive turns toward the character's right. */
  headYaw?: number
  armR: [number, number]
  armL: [number, number]
  /** Abduction away from the torso in degrees; beyond 90 raises the arm. */
  spreadArmR?: number
  spreadArmL?: number
  legR: [number, number]
  legL: [number, number]
  spreadLegR?: number
  spreadLegL?: number
  /** Tips the whole figure about the lateral axis; positive falls forward. */
  rootTilt?: number
  /**
   * Skip the ground alignment below. Only for poses that genuinely leave the
   * floor — everything else is dropped until its lowest joint touches down.
   */
  airborne?: boolean
}

export interface PosePreset {
  id: PoseId
  label: string
  category: PoseCategory
  skeleton: PoseSkeleton
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: 'stand',
    label: '站立',
    category: '静止',
    skeleton: {
      hip: 0.53,
      lean: 2,
      armR: [6, 10],
      armL: [6, 10],
      spreadArmR: 8,
      spreadArmL: 8,
      legR: [1, -2],
      legL: [-1, -2],
      spreadLegR: 4,
      spreadLegL: 4,
    },
  },
  {
    id: 'walk',
    label: '行走',
    category: '移动',
    skeleton: {
      hip: 0.515,
      lean: 5,
      armR: [-26, 10],
      armL: [24, 16],
      spreadArmR: 6,
      spreadArmL: 6,
      legR: [24, -10],
      legL: [-22, -18],
      spreadLegR: 3,
      spreadLegL: 3,
    },
  },
  {
    id: 'run',
    label: '奔跑',
    category: '移动',
    skeleton: {
      hip: 0.5,
      lean: 16,
      airborne: true,
      armR: [-52, 78],
      armL: [46, 84],
      spreadArmR: 8,
      spreadArmL: 8,
      legR: [46, -58],
      legL: [-40, -72],
      spreadLegR: 4,
      spreadLegL: 4,
    },
  },
  {
    id: 'sit',
    label: '坐下',
    category: '静止',
    skeleton: {
      hip: 0.44,
      lean: 6,
      armR: [16, 40],
      armL: [16, 40],
      spreadArmR: 10,
      spreadArmL: 10,
      legR: [78, -80],
      legL: [78, -80],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'crouch',
    label: '蹲伏',
    category: '静止',
    skeleton: {
      hip: 0.28,
      lean: 24,
      armR: [40, 50],
      armL: [40, 50],
      spreadArmR: 6,
      spreadArmL: 6,
      legR: [66, -118],
      legL: [66, -118],
      spreadLegR: 12,
      spreadLegL: 12,
    },
  },
  {
    id: 'jump',
    label: '跳跃',
    category: '移动',
    skeleton: {
      hip: 0.7,
      lean: -6,
      airborne: true,
      armR: [-160, -14],
      armL: [-160, -14],
      spreadArmR: 12,
      spreadArmL: 12,
      legR: [30, -46],
      legL: [24, -40],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'lean',
    label: '倚靠',
    category: '静止',
    skeleton: {
      hip: 0.5,
      lean: -12,
      sway: 8,
      armR: [10, 26],
      armL: [-14, 8],
      spreadArmR: 6,
      spreadArmL: 26,
      legR: [8, -6],
      legL: [-16, -4],
      spreadLegR: 4,
      spreadLegL: 10,
    },
  },
  {
    id: 'lookBack',
    label: '回头',
    category: '情绪',
    skeleton: {
      hip: 0.525,
      lean: 1,
      sway: -6,
      headYaw: 62,
      armR: [10, 14],
      armL: [2, 8],
      spreadArmR: 7,
      spreadArmL: 9,
      legR: [12, -8],
      legL: [-10, -6],
      spreadLegR: 4,
      spreadLegL: 4,
    },
  },
  {
    id: 'wave',
    label: '招手',
    category: '交互',
    skeleton: {
      hip: 0.53,
      lean: 0,
      headPitch: -4,
      armR: [0, 22],
      armL: [8, 10],
      spreadArmR: 148,
      spreadArmL: 6,
      legR: [2, -3],
      legL: [-2, -3],
      spreadLegR: 5,
      spreadLegL: 5,
    },
  },
  {
    id: 'point',
    label: '指向',
    category: '交互',
    skeleton: {
      hip: 0.53,
      lean: 4,
      headPitch: -2,
      armR: [88, 2],
      armL: [6, 10],
      spreadArmR: 8,
      spreadArmL: 7,
      legR: [8, -6],
      legL: [-8, -5],
      spreadLegR: 5,
      spreadLegL: 5,
    },
  },
  {
    id: 'hold',
    label: '持物',
    category: '交互',
    skeleton: {
      hip: 0.525,
      lean: 3,
      headPitch: 6,
      armR: [62, 34],
      armL: [62, 34],
      spreadArmR: 22,
      spreadArmL: 22,
      legR: [3, -3],
      legL: [-3, -3],
      spreadLegR: 5,
      spreadLegL: 5,
    },
  },
  {
    id: 'talk',
    label: '交谈',
    category: '交互',
    skeleton: {
      hip: 0.53,
      lean: 3,
      sway: 3,
      headYaw: 22,
      armR: [18, 58],
      armL: [10, 40],
      spreadArmR: 26,
      spreadArmL: 20,
      legR: [4, -4],
      legL: [-6, -4],
      spreadLegR: 6,
      spreadLegL: 5,
    },
  },
  {
    id: 'think',
    label: '思考',
    category: '情绪',
    skeleton: {
      hip: 0.525,
      lean: 6,
      headPitch: 12,
      armR: [10, 128],
      armL: [4, 48],
      spreadArmR: 6,
      spreadArmL: 24,
      legR: [2, -3],
      legL: [-4, -3],
      spreadLegR: 4,
      spreadLegL: 4,
    },
  },
  {
    id: 'surprise',
    label: '惊讶',
    category: '情绪',
    skeleton: {
      hip: 0.52,
      lean: -10,
      headPitch: -14,
      armR: [-30, 46],
      armL: [-30, 46],
      spreadArmR: 44,
      spreadArmL: 44,
      legR: [-6, -4],
      legL: [-6, -4],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'guard',
    label: '防御',
    category: '战斗',
    skeleton: {
      hip: 0.48,
      lean: 12,
      headPitch: 4,
      armR: [46, 76],
      armL: [30, 88],
      spreadArmR: 16,
      spreadArmL: 22,
      legR: [26, -24],
      legL: [-24, -30],
      spreadLegR: 10,
      spreadLegL: 10,
    },
  },
  {
    id: 'fallen',
    label: '倒地',
    category: '静止',
    skeleton: {
      hip: 0.13,
      lean: -10,
      rootTilt: 82,
      headPitch: -20,
      armR: [-40, 20],
      armL: [30, 26],
      spreadArmR: 30,
      spreadArmL: 40,
      legR: [16, -30],
      legL: [-8, -16],
      spreadLegR: 14,
      spreadLegL: 10,
    },
  },
  {
    id: 'climb',
    label: '攀爬',
    category: '移动',
    skeleton: {
      hip: 0.56,
      lean: 10,
      rootTilt: -12,
      airborne: true,
      headPitch: -16,
      armR: [-140, -16],
      armL: [-92, -22],
      spreadArmR: 18,
      spreadArmL: 14,
      legR: [54, -56],
      legL: [10, -10],
      spreadLegR: 16,
      spreadLegL: 6,
    },
  },
  {
    id: 'dance',
    label: '舞蹈',
    category: '移动',
    skeleton: {
      hip: 0.52,
      lean: 4,
      sway: -14,
      headYaw: 16,
      armR: [-124, -30],
      armL: [58, 46],
      spreadArmR: 40,
      spreadArmL: 34,
      legR: [30, -26],
      legL: [-14, -8],
      spreadLegR: 22,
      spreadLegL: 8,
    },
  },
  {
    id: 'bow',
    label: '鞠躬',
    category: '交互',
    skeleton: {
      hip: 0.52,
      lean: 62,
      headPitch: 14,
      armR: [-52, 4],
      armL: [-52, 4],
      spreadArmR: 6,
      spreadArmL: 6,
      legR: [2, -2],
      legL: [-2, -2],
      spreadLegR: 4,
      spreadLegL: 4,
    },
  },
  {
    id: 'salute',
    label: '敬礼',
    category: '交互',
    skeleton: {
      hip: 0.535,
      lean: -2,
      armR: [12, 132],
      armL: [4, 4],
      spreadArmR: 30,
      spreadArmL: 3,
      legR: [0, -1],
      legL: [0, -1],
      spreadLegR: 3,
      spreadLegL: 3,
    },
  },
  {
    id: 'kneel',
    label: '单膝跪',
    category: '静止',
    skeleton: {
      hip: 0.32,
      lean: 8,
      armR: [22, 44],
      armL: [10, 16],
      spreadArmR: 8,
      spreadArmL: 8,
      legR: [70, -84],
      legL: [-16, -120],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'aim',
    label: '瞄准',
    category: '战斗',
    skeleton: {
      hip: 0.51,
      lean: 6,
      sway: 4,
      headYaw: 6,
      armR: [82, 6],
      armL: [76, 34],
      spreadArmR: 6,
      spreadArmL: 20,
      legR: [20, -16],
      legL: [-18, -22],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'reach',
    label: '伸手',
    category: '交互',
    skeleton: {
      hip: 0.545,
      lean: 14,
      headPitch: -18,
      armR: [-118, -8],
      armL: [20, 20],
      spreadArmR: 22,
      spreadArmL: 12,
      legR: [10, -8],
      legL: [-8, -6],
      spreadLegR: 5,
      spreadLegL: 5,
    },
  },
  {
    id: 'push',
    label: '推动',
    category: '交互',
    skeleton: {
      hip: 0.5,
      lean: 22,
      headPitch: -4,
      armR: [78, 8],
      armL: [78, 8],
      spreadArmR: 12,
      spreadArmL: 12,
      legR: [-30, -16],
      legL: [10, -10],
      spreadLegR: 8,
      spreadLegL: 8,
    },
  },
  {
    id: 'celebrate',
    label: '欢呼',
    category: '情绪',
    skeleton: {
      hip: 0.55,
      lean: -6,
      headPitch: -12,
      armR: [-158, -10],
      armL: [-158, -10],
      spreadArmR: 26,
      spreadArmL: 26,
      legR: [4, -4],
      legL: [-4, -4],
      spreadLegR: 10,
      spreadLegL: 10,
    },
  },
]

const POSE_BY_ID = new Map(POSE_PRESETS.map((pose) => [pose.id, pose]))

export function posePreset(id: PoseId): PosePreset {
  return POSE_BY_ID.get(id) ?? POSE_PRESETS[0]
}

export function poseLabel(id: PoseId): string {
  return posePreset(id).label
}

/* ------------------------------------------------------------------ *
 * Skeleton solving
 * ------------------------------------------------------------------ */

export type JointId =
  | 'pelvis'
  | 'chest'
  | 'neck'
  | 'head'
  | 'nose'
  | 'shoulderL'
  | 'elbowL'
  | 'handL'
  | 'shoulderR'
  | 'elbowR'
  | 'handR'
  | 'hipL'
  | 'kneeL'
  | 'footL'
  | 'hipR'
  | 'kneeR'
  | 'footR'

/**
 * A point in body space, normalised to body height:
 * `s` toward the character's front, `l` toward their right, `u` upward.
 */
export interface BodyPoint {
  s: number
  l: number
  u: number
}

export type Skeleton = Record<JointId, BodyPoint>

/** Segment lengths as fractions of total height. */
export const BODY = {
  torso: 0.3,
  neck: 0.075,
  headRadius: 0.058,
  upperArm: 0.155,
  foreArm: 0.145,
  thigh: 0.245,
  shin: 0.235,
  shoulderHalf: 0.085,
  hipHalf: 0.055,
}

export const POSE_BONES: { from: JointId; to: JointId; weight: 'torso' | 'limb' | 'detail' }[] = [
  { from: 'pelvis', to: 'chest', weight: 'torso' },
  { from: 'chest', to: 'neck', weight: 'torso' },
  { from: 'neck', to: 'head', weight: 'limb' },
  { from: 'head', to: 'nose', weight: 'detail' },
  { from: 'neck', to: 'shoulderL', weight: 'detail' },
  { from: 'shoulderL', to: 'elbowL', weight: 'limb' },
  { from: 'elbowL', to: 'handL', weight: 'limb' },
  { from: 'neck', to: 'shoulderR', weight: 'detail' },
  { from: 'shoulderR', to: 'elbowR', weight: 'limb' },
  { from: 'elbowR', to: 'handR', weight: 'limb' },
  { from: 'pelvis', to: 'hipL', weight: 'detail' },
  { from: 'hipL', to: 'kneeL', weight: 'limb' },
  { from: 'kneeL', to: 'footL', weight: 'limb' },
  { from: 'pelvis', to: 'hipR', weight: 'detail' },
  { from: 'hipR', to: 'kneeR', weight: 'limb' },
  { from: 'kneeR', to: 'footR', weight: 'limb' },
]

const DEG = Math.PI / 180

function rad(degrees: number): number {
  return degrees * DEG
}

function add(point: BodyPoint, dir: BodyPoint, length: number): BodyPoint {
  return { s: point.s + dir.s * length, l: point.l + dir.l * length, u: point.u + dir.u * length }
}

/**
 * Direction of a limb segment hanging from its parent joint: 0/0 points
 * straight down, `swing` rotates it toward the front, `spread` away from the
 * body on the given side.
 */
function limbDir(swing: number, spread: number, side: 1 | -1): BodyPoint {
  const sw = rad(swing)
  const sp = rad(spread)
  return { s: Math.cos(sp) * Math.sin(sw), l: side * Math.sin(sp), u: -Math.cos(sp) * Math.cos(sw) }
}

/** Rotation about the lateral axis; positive tips the up-axis toward the front. */
function rotLateral(point: BodyPoint, degrees: number): BodyPoint {
  const a = rad(degrees)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { s: point.s * cos + point.u * sin, l: point.l, u: -point.s * sin + point.u * cos }
}

/** Rotation about the sagittal axis; positive tips the up-axis toward the right. */
function rotSagittal(point: BodyPoint, degrees: number): BodyPoint {
  const a = rad(degrees)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { s: point.s, l: point.l * cos + point.u * sin, u: -point.l * sin + point.u * cos }
}

const skeletonCache = new Map<PoseId, Skeleton>()

/** Forward-kinematics solve of a pose preset, memoised because poses are static. */
export function poseSkeleton(id: PoseId): Skeleton {
  const cached = skeletonCache.get(id)
  if (cached) return cached

  const s = posePreset(id).skeleton
  const sway = s.sway ?? 0

  const pelvis: BodyPoint = { s: 0, l: 0, u: s.hip }
  const torsoDir = rotSagittal(rotLateral({ s: 0, l: 0, u: 1 }, s.lean), sway)
  const lateral = rotSagittal({ s: 0, l: 1, u: 0 }, sway)

  const chest = add(pelvis, torsoDir, BODY.torso * 0.55)
  const neck = add(pelvis, torsoDir, BODY.torso)

  const headDir = rotLateral(torsoDir, -(s.headPitch ?? 0))
  const head = add(neck, headDir, BODY.neck + BODY.headRadius)

  // A short "nose" bone is the cheapest honest cue for which way a stick
  // figure is looking once the body is projected down to two dimensions.
  const pitch = rad(s.headPitch ?? 0)
  const yaw = rad(s.headYaw ?? 0)
  const gaze: BodyPoint = {
    s: Math.cos(pitch) * Math.cos(yaw),
    l: Math.cos(pitch) * Math.sin(yaw),
    u: -Math.sin(pitch),
  }
  const nose = add(head, gaze, BODY.headRadius * 1.7)

  const shoulderR = add(neck, lateral, BODY.shoulderHalf)
  const shoulderL = add(neck, lateral, -BODY.shoulderHalf)
  const hipR = add(pelvis, lateral, BODY.hipHalf)
  const hipL = add(pelvis, lateral, -BODY.hipHalf)

  const armRUpper = limbDir(s.armR[0], s.spreadArmR ?? 0, 1)
  const armRFore = limbDir(s.armR[0] + s.armR[1], s.spreadArmR ?? 0, 1)
  const armLUpper = limbDir(s.armL[0], s.spreadArmL ?? 0, -1)
  const armLFore = limbDir(s.armL[0] + s.armL[1], s.spreadArmL ?? 0, -1)

  const elbowR = add(shoulderR, armRUpper, BODY.upperArm)
  const handR = add(elbowR, armRFore, BODY.foreArm)
  const elbowL = add(shoulderL, armLUpper, BODY.upperArm)
  const handL = add(elbowL, armLFore, BODY.foreArm)

  const legRThigh = limbDir(s.legR[0], s.spreadLegR ?? 0, 1)
  const legRShin = limbDir(s.legR[0] + s.legR[1], s.spreadLegR ?? 0, 1)
  const legLThigh = limbDir(s.legL[0], s.spreadLegL ?? 0, -1)
  const legLShin = limbDir(s.legL[0] + s.legL[1], s.spreadLegL ?? 0, -1)

  const kneeR = add(hipR, legRThigh, BODY.thigh)
  const footR = add(kneeR, legRShin, BODY.shin)
  const kneeL = add(hipL, legLThigh, BODY.thigh)
  const footL = add(kneeL, legLShin, BODY.shin)

  let skeleton: Skeleton = {
    pelvis,
    chest,
    neck,
    head,
    nose,
    shoulderL,
    elbowL,
    handL,
    shoulderR,
    elbowR,
    handR,
    hipL,
    kneeL,
    footL,
    hipR,
    kneeR,
    footR,
  }

  if (s.rootTilt) {
    const tilt = s.rootTilt
    const tilted = {} as Skeleton
    for (const [joint, point] of Object.entries(skeleton) as [JointId, BodyPoint][]) {
      const local = rotLateral({ s: point.s - pelvis.s, l: point.l - pelvis.l, u: point.u - pelvis.u }, tilt)
      tilted[joint] = { s: pelvis.s + local.s, l: pelvis.l + local.l, u: pelvis.u + local.u }
    }
    skeleton = tilted
  }

  // Hip heights are anatomical, but the ankle is not the sole: without this
  // drop a standing figure hovers a few centimetres over its own mark on the
  // blocking map, and the preview stops agreeing with the top-down view.
  if (!s.airborne) {
    const values = Object.values(skeleton)
    const lowest = Math.min(...values.map((point) => point.u))
    if (Math.abs(lowest) > 1e-6) {
      const dropped = {} as Skeleton
      for (const [joint, point] of Object.entries(skeleton) as [JointId, BodyPoint][]) {
        dropped[joint] = { s: point.s, l: point.l, u: point.u - lowest }
      }
      skeleton = dropped
    }
  }

  skeletonCache.set(id, skeleton)
  return skeleton
}

/**
 * Flatten a body-space point onto the screen for an actor whose yaw differs
 * from the camera's by `relativeYaw` degrees. The sagittal axis projects
 * through `sin`, the lateral axis through `cos`, so a figure facing the lens
 * shows its shoulders and a figure in profile shows its nose and its stride —
 * exactly the foreshortening a real lens produces.
 *
 * Returns offsets in body heights, `y` already pointing down for SVG.
 */
export function projectBodyPoint(point: BodyPoint, relativeYaw: number): { x: number; y: number } {
  const a = rad(relativeYaw)
  return { x: point.s * Math.sin(a) + point.l * Math.cos(a), y: -point.u }
}

/* ------------------------------------------------------------------ *
 * Camera maths
 * ------------------------------------------------------------------ */

/** Anything closer than this is behind the lens for drawing purposes. */
export const NEAR_PLANE = 0.08

export interface Viewport {
  width: number
  height: number
}

export interface CameraSpacePoint {
  x: number
  y: number
  z: number
}

export interface ProjectedPoint {
  x: number
  y: number
  /** Distance along the lens axis, for painter-order sorting. */
  depth: number
  /** Screen pixels per world metre at this depth; uniform in x and y. */
  scale: number
  visible: boolean
}

export function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export function cameraForward(yaw: number): GroundPoint {
  const a = rad(yaw)
  return { x: Math.sin(a), z: Math.cos(a) }
}

export function cameraRight(yaw: number): GroundPoint {
  const a = rad(yaw)
  return { x: Math.cos(a), z: -Math.sin(a) }
}

/** Yaw that points `from` at `to`, in degrees. */
export function yawTowards(from: Vec3, to: Vec3): number {
  return normalizeAngle((Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI)
}

/** The camera with its look-at constraint applied, ready for projection. */
export function resolveCamera(scene: DirectorScene, camera: Camera): Camera {
  if (!camera.lookAtActorId) return camera
  const target = scene.actors.find((actor) => actor.id === camera.lookAtActorId)
  if (!target) return camera
  const aim: Vec3 = { x: target.position.x, y: target.position.y, z: target.position.z }
  return { ...camera, rotationY: yawTowards(camera.position, aim) }
}

export function activeCamera(scene: DirectorScene): Camera | null {
  return scene.cameras.find((camera) => camera.id === scene.activeCameraId) ?? scene.cameras[0] ?? null
}

/** The active camera with its look-at constraint already resolved. */
export function activeResolvedCamera(scene: DirectorScene): Camera | null {
  const camera = activeCamera(scene)
  return camera ? resolveCamera(scene, camera) : null
}

/** World → camera space. `camera.rotationY` must already be resolved. */
export function worldToCamera(point: Vec3, camera: Camera): CameraSpacePoint {
  const a = rad(camera.rotationY)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = point.x - camera.position.x
  const dy = point.y - camera.position.y
  const dz = point.z - camera.position.z
  return { x: dx * cos - dz * sin, y: dy, z: dx * sin + dz * cos }
}

export function cameraToScreen(point: CameraSpacePoint, camera: Camera, viewport: Viewport): ProjectedPoint {
  const halfWidth = Math.tan(rad(clamp(camera.fov, 1, 175)) / 2)
  const visible = point.z >= NEAR_PLANE
  // Clamping keeps the numbers finite for points behind the lens so callers can
  // still read `scale` without special-casing NaN.
  const depth = Math.max(point.z, NEAR_PLANE)
  const scale = viewport.width / (2 * depth * halfWidth)
  return {
    x: viewport.width / 2 + point.x * scale,
    y: viewport.height / 2 - point.y * scale,
    depth: point.z,
    scale,
    visible,
  }
}

/**
 * Full perspective projection: world point → pixel inside a viewport whose
 * width/height already match the camera's aspect ratio.
 */
export function worldToCameraView(point: Vec3, camera: Camera, viewport: Viewport): ProjectedPoint {
  return cameraToScreen(worldToCamera(point, camera), camera, viewport)
}

function lerpCameraPoint(a: CameraSpacePoint, b: CameraSpacePoint, t: number): CameraSpacePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

/**
 * Project a world-space segment, clipped against the near plane. Returns null
 * when the whole segment sits behind the lens — without this a line crossing
 * the camera plane would fold over and draw a phantom mirror image.
 */
export function projectSegment(
  from: Vec3,
  to: Vec3,
  camera: Camera,
  viewport: Viewport,
): { a: ProjectedPoint; b: ProjectedPoint } | null {
  let ca = worldToCamera(from, camera)
  let cb = worldToCamera(to, camera)
  const aIn = ca.z >= NEAR_PLANE
  const bIn = cb.z >= NEAR_PLANE
  if (!aIn && !bIn) return null
  if (!aIn) ca = lerpCameraPoint(ca, cb, (NEAR_PLANE - ca.z) / (cb.z - ca.z))
  else if (!bIn) cb = lerpCameraPoint(cb, ca, (NEAR_PLANE - cb.z) / (ca.z - cb.z))
  return { a: cameraToScreen(ca, camera, viewport), b: cameraToScreen(cb, camera, viewport) }
}

/**
 * The camera's field of view as a ground-plane polygon: apex at the lens, then
 * the two far corners. Drawn on the top-down map so the director can see what
 * the preview is about to include.
 */
export function frustumPolygon(camera: Camera, far = 14): GroundPoint[] {
  const forward = cameraForward(camera.rotationY)
  const right = cameraRight(camera.rotationY)
  const halfWidth = far * Math.tan(rad(clamp(camera.fov, 1, 175)) / 2)
  const centre = { x: camera.position.x + forward.x * far, z: camera.position.z + forward.z * far }
  return [
    { x: camera.position.x, z: camera.position.z },
    { x: centre.x - right.x * halfWidth, z: centre.z - right.z * halfWidth },
    { x: centre.x + right.x * halfWidth, z: centre.z + right.z * halfWidth },
  ]
}

/** Ground lines around the camera, for drawing perspective floor grid. */
export function groundGridSegments(camera: Camera, step = 1, extent = 26): [Vec3, Vec3][] {
  const forward = cameraForward(camera.rotationY)
  // Bias the patch forward: grid behind the lens is clipped away anyway.
  const cx = camera.position.x + forward.x * extent * 0.42
  const cz = camera.position.z + forward.z * extent * 0.42
  const half = extent / 2
  const segments: [Vec3, Vec3][] = []
  const xStart = Math.ceil((cx - half) / step) * step
  const zStart = Math.ceil((cz - half) / step) * step
  for (let x = xStart; x <= cx + half + 1e-6; x += step) {
    segments.push([
      { x, y: 0, z: cz - half },
      { x, y: 0, z: cz + half },
    ])
  }
  for (let z = zStart; z <= cz + half + 1e-6; z += step) {
    segments.push([
      { x: cx - half, y: 0, z },
      { x: cx + half, y: 0, z },
    ])
  }
  return segments
}

/* ------------------------------------------------------------------ *
 * Top-down map maths
 * ------------------------------------------------------------------ */

export interface TopDownView {
  width: number
  height: number
  /** World point pinned to the centre of the viewport. */
  center: GroundPoint
  pixelsPerUnit: number
}

/** World ground point → pixel on the blocking map. +z draws upward. */
export function worldToTopDown(point: GroundPoint, view: TopDownView): { x: number; y: number } {
  return {
    x: view.width / 2 + (point.x - view.center.x) * view.pixelsPerUnit,
    y: view.height / 2 - (point.z - view.center.z) * view.pixelsPerUnit,
  }
}

/** Inverse of {@link worldToTopDown}; used while dragging. */
export function topDownToWorld(point: { x: number; y: number }, view: TopDownView): GroundPoint {
  return {
    x: view.center.x + (point.x - view.width / 2) / view.pixelsPerUnit,
    z: view.center.z - (point.y - view.height / 2) / view.pixelsPerUnit,
  }
}

/** Axis-aligned world bounds covering every object, with a little air. */
export function sceneBounds(scene: DirectorScene, padding = 2): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
} {
  const xs: number[] = []
  const zs: number[] = []
  for (const camera of scene.cameras) {
    xs.push(camera.position.x)
    zs.push(camera.position.z)
  }
  for (const actor of scene.actors) {
    xs.push(actor.position.x)
    zs.push(actor.position.z)
  }
  for (const prop of scene.props) {
    const reach = Math.max(prop.size.w, prop.size.d) / 2
    xs.push(prop.position.x - reach, prop.position.x + reach)
    zs.push(prop.position.z - reach, prop.position.z + reach)
  }
  if (xs.length === 0) return { minX: -4, maxX: 4, minZ: -4, maxZ: 4 }
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding,
    maxZ: Math.max(...zs) + padding,
  }
}

/* ------------------------------------------------------------------ *
 * Prop geometry
 * ------------------------------------------------------------------ */

/** The eight corners of a prop's box, bottom face first. */
export function propCorners(prop: Prop): Vec3[] {
  const a = rad(prop.rotationY)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const hw = prop.size.w / 2
  const hd = prop.size.d / 2
  const base: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  const ground = base.map(([lx, lz]) => ({
    x: prop.position.x + lx * cos + lz * sin,
    z: prop.position.z - lx * sin + lz * cos,
  }))
  const bottom = ground.map((p) => ({ x: p.x, y: prop.position.y, z: p.z }))
  const top = ground.map((p) => ({ x: p.x, y: prop.position.y + prop.size.h, z: p.z }))
  return [...bottom, ...top]
}

/** Corner index pairs for the twelve box edges. */
export const BOX_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
]

/** Corner index quads for the six box faces. */
export const BOX_FACES: [number, number, number, number][] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
]

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export const ACTOR_RADIUS = 0.28

export function createCamera(name: string, position: Vec3, rotationY = 0): Camera {
  return {
    id: newId('cam'),
    name,
    position: { ...position },
    rotationY: normalizeAngle(rotationY),
    fov: 38,
    aspectRatio: '16:9',
    lookAtActorId: null,
  }
}

export function createActor(name: string, position: Vec3, rotationY = 180): Actor {
  return {
    id: newId('act'),
    name,
    position: { ...position },
    rotationY: normalizeAngle(rotationY),
    pose: 'stand',
    height: 1.72,
  }
}

export function createProp(name: string, position: Vec3, kind: PropKind = 'box'): Prop {
  return {
    id: newId('prp'),
    name,
    position: { ...position },
    rotationY: 0,
    size: propKindSize(kind),
    kind,
  }
}

export function createShot(name: string, camera: Camera): CapturedShot {
  return {
    id: newId('shot'),
    name,
    // Frozen framing: the look-at rule is resolved away so the shot survives
    // actors moving after the capture.
    camera: { ...camera, position: { ...camera.position }, lookAtActorId: null },
    createdAt: new Date().toISOString(),
  }
}

/**
 * A two-hander over a table: close enough to a real blocking start that the
 * first thing a director does is nudge, not build from nothing.
 *
 * Ids are fixed rather than generated so a scene persisted into node data keeps
 * resolving after a reload, and so captured shots keep pointing at a real camera.
 */
export function createDefaultScene(): DirectorScene {
  return {
    activeCameraId: 'cam-main',
    cameras: [
      {
        id: 'cam-main',
        name: '主机位',
        // Far enough back that a 46° lens at eye height keeps both actors
        // whole in frame — the first thing a director should see is the pose.
        position: { x: 0, y: 1.55, z: -7.4 },
        rotationY: 0,
        fov: 46,
        aspectRatio: '16:9',
        lookAtActorId: null,
      },
      {
        id: 'cam-side',
        name: '侧机位',
        position: { x: 5.4, y: 1.4, z: -2.2 },
        rotationY: 295,
        fov: 58,
        aspectRatio: '16:9',
        lookAtActorId: null,
      },
    ],
    actors: [
      {
        id: 'actor-a',
        name: '角色 A',
        position: { x: -0.85, y: 0, z: 0.4 },
        rotationY: 168,
        pose: 'talk',
        height: 1.74,
      },
      {
        id: 'actor-b',
        name: '角色 B',
        position: { x: 1.05, y: 0, z: 1.5 },
        rotationY: 208,
        pose: 'stand',
        height: 1.63,
      },
    ],
    props: [
      {
        id: 'prop-table',
        name: '长桌',
        position: { x: 0.1, y: 0, z: 1.1 },
        rotationY: 12,
        size: { w: 1.8, d: 0.9, h: 0.75 },
        kind: 'table',
      },
      {
        id: 'prop-pillar',
        name: '立柱',
        position: { x: -3.1, y: 0, z: 2.6 },
        rotationY: 0,
        size: { w: 0.45, d: 0.45, h: 3.2 },
        kind: 'pillar',
      },
    ],
  }
}

/** Structural clone so edits never mutate the caller's persisted scene. */
export function cloneScene(scene: DirectorScene): DirectorScene {
  return {
    activeCameraId: scene.activeCameraId,
    cameras: scene.cameras.map((camera) => ({ ...camera, position: { ...camera.position } })),
    actors: scene.actors.map((actor) => ({ ...actor, position: { ...actor.position } })),
    props: scene.props.map((prop) => ({ ...prop, position: { ...prop.position }, size: { ...prop.size } })),
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Round to a grid step; the studio snaps drags to 0.25 m by default. */
export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value
}
