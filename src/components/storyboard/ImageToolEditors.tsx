'use client'

import { useMemo, useState } from 'react'
import { CROP_ASPECTS, MULTI_ANGLE_PRESETS, emotionLabel } from '@/domain/libraries'
import { cn } from '@/lib/cn'
import { Dialog } from '../ui/Dialog'
import { Field, SegmentedControl, Slider } from '../ui/controls'
import { IconCredit, IconRefresh } from '../icons'

/**
 * Editors reached from an image's action bar.
 *
 * None of them mutate the source image. Each one resolves to a *request*: a
 * prompt fragment plus an output spec, which the caller turns into a new
 * pending node wired back to this image as a reference. Keeping them
 * non-destructive is what makes the provenance chain in the storyboard work.
 */

export interface ImageToolRequest {
  tool: string
  label: string
  prompt: string
  output: {
    resolution: '1K' | '2K' | '4K'
    quality: 'standard' | 'high'
    count: 1 | 2 | 4
    aspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  }
  credits: number
}

interface EditorProps {
  open: boolean
  imageUrl: string | null
  onClose: () => void
  onSubmit: (request: ImageToolRequest) => void
}

/* ------------------------------------------------------------------ *
 * Crop — the only tool that is a pure local transform
 * ------------------------------------------------------------------ */

export function CropEditor({
  open,
  imageUrl,
  onClose,
  onApply,
}: {
  open: boolean
  imageUrl: string | null
  onClose: () => void
  onApply: (aspect: string, rotation: number, mirrored: boolean) => void
}) {
  const [aspect, setAspect] = useState<string>('原图')
  const [rotation, setRotation] = useState(0)
  const [mirrored, setMirrored] = useState(false)

  const frameRatio = useMemo(() => {
    if (aspect === '原图') return null
    const [w, h] = aspect.split(':').map(Number)
    return w / h
  }, [aspect])

  return (
    <Dialog open={open} onClose={onClose} title="裁剪与旋转" width={560} testId="crop-editor">
      <div className="space-y-4">
        <div className="flex items-center justify-center overflow-hidden rounded-xl bg-ink-900/95 p-4">
          <div
            className="relative max-h-[300px] overflow-hidden"
            style={frameRatio ? { aspectRatio: String(frameRatio), width: '100%' } : undefined}
          >
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="裁剪预览"
                className="h-full w-full object-cover transition-transform"
                style={{ transform: `rotate(${rotation}deg) scaleX(${mirrored ? -1 : 1})` }}
              />
            )}
          </div>
        </div>

        <Field label="比例">
          <div className="flex flex-wrap gap-1.5">
            {CROP_ASPECTS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAspect(option)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  aspect === option ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="flex-1 rounded-lg bg-ink-100 py-2 text-[12px] text-ink-700 hover:bg-ink-200"
          >
            旋转 90°
          </button>
          <button
            type="button"
            onClick={() => setMirrored((m) => !m)}
            className={cn(
              'flex-1 rounded-lg py-2 text-[12px] transition-colors',
              mirrored ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
            )}
          >
            水平镜像
          </button>
          <button
            type="button"
            onClick={() => {
              setAspect('原图')
              setRotation(0)
              setMirrored(false)
            }}
            className="rounded-lg bg-ink-100 p-2 text-ink-600 hover:bg-ink-200"
            aria-label="重置"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3.5 py-2 text-[13px] text-ink-600 hover:bg-ink-50"
        >
          取消
        </button>
        <button
          type="button"
          data-testid="crop-confirm"
          onClick={() => {
            onApply(aspect, rotation, mirrored)
            onClose()
          }}
          className="rounded-lg bg-ink-900 px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-85"
        >
          确认
        </button>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Lighting
 * ------------------------------------------------------------------ */

export function LightingEditor({ open, imageUrl, onClose, onSubmit }: EditorProps) {
  const [brightness, setBrightness] = useState(0)
  const [temperature, setTemperature] = useState(0)
  const [keyAngle, setKeyAngle] = useState(45)
  const [rimLight, setRimLight] = useState(0)

  // Execution stays disabled until something actually differs from the source.
  const untouched = brightness === 0 && temperature === 0 && keyAngle === 45 && rimLight === 0

  const describe = () => {
    const parts: string[] = ['保持构图与主体不变，仅重建布光。']
    if (brightness !== 0) parts.push(`整体亮度${brightness > 0 ? '提高' : '降低'} ${Math.abs(brightness)}%`)
    if (temperature !== 0) parts.push(`色温偏${temperature > 0 ? '暖' : '冷'} ${Math.abs(temperature)}%`)
    parts.push(`主光来自 ${keyAngle}° 方向`)
    if (rimLight > 0) parts.push(`增加强度 ${rimLight}% 的轮廓光`)
    return parts.join('，')
  }

  return (
    <Dialog open={open} onClose={onClose} title="打光" width={520} testId="lighting-editor">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-ink-900/95 p-3">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="打光预览"
              className="mx-auto max-h-[220px] rounded-lg"
              style={{
                filter: `brightness(${1 + brightness / 140}) sepia(${Math.max(0, temperature) / 260}) saturate(${1 + Math.abs(temperature) / 240})`,
              }}
            />
          )}
        </div>

        <Slider label="整体亮度" min={-50} max={50} value={brightness} onChange={setBrightness} />
        <Slider
          label="色温"
          min={-50}
          max={50}
          value={temperature}
          onChange={setTemperature}
          format={(v) => (v === 0 ? '中性' : v > 0 ? `暖 ${v}` : `冷 ${-v}`)}
        />
        <Slider
          label="主光方向"
          min={0}
          max={359}
          value={keyAngle}
          onChange={setKeyAngle}
          format={(v) => `${v}°`}
        />
        <Slider label="轮廓光" min={0} max={100} value={rimLight} onChange={setRimLight} />
      </div>

      <SubmitBar
        disabled={untouched}
        disabledHint="调整任意参数后才能执行"
        credits={22}
        onCancel={onClose}
        onSubmit={() => {
          onSubmit({
            tool: 'lighting',
            label: '打光',
            prompt: describe(),
            output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
            credits: 22,
          })
          onClose()
        }}
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Multi-angle
 * ------------------------------------------------------------------ */

export function MultiAngleEditor({ open, imageUrl, onClose, onSubmit }: EditorProps) {
  const [preset, setPreset] = useState<string | null>(null)
  const [orbit, setOrbit] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [zoom, setZoom] = useState(0)
  const [extra, setExtra] = useState('')

  const untouched = !preset && orbit === 0 && pitch === 0 && zoom === 0 && !extra.trim()

  const describe = () => {
    const parts: string[] = ['保持主体、服装与场景一致，仅改变观察角度。']
    if (preset) parts.push(`采用${preset}视角`)
    if (orbit !== 0) parts.push(`水平环绕 ${orbit > 0 ? '向右' : '向左'} ${Math.abs(orbit)}°`)
    if (pitch !== 0) parts.push(`垂直俯仰 ${pitch > 0 ? '俯视' : '仰视'} ${Math.abs(pitch)}°`)
    if (zoom !== 0) parts.push(`景别${zoom > 0 ? '推近' : '拉远'} ${Math.abs(zoom)}%`)
    if (extra.trim()) parts.push(extra.trim())
    return parts.join('，')
  }

  return (
    <Dialog open={open} onClose={onClose} title="多角度" width={520} testId="multi-angle-editor">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-ink-900/95 p-3">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="多角度预览"
              className="mx-auto max-h-[200px] rounded-lg transition-transform"
              style={{ transform: `perspective(700px) rotateY(${orbit / 3}deg) rotateX(${-pitch / 3}deg) scale(${1 + zoom / 260})` }}
            />
          )}
        </div>

        <Field label="预设">
          <div className="flex flex-wrap gap-1.5">
            {MULTI_ANGLE_PRESETS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPreset(preset === option ? null : option)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                  preset === option ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>

        <Slider label="水平环绕" min={-90} max={90} value={orbit} onChange={setOrbit} format={(v) => `${v}°`} />
        <Slider label="垂直俯仰" min={-60} max={60} value={pitch} onChange={setPitch} format={(v) => `${v}°`} />
        <Slider label="景别缩放" min={-50} max={50} value={zoom} onChange={setZoom} />

        <Field label="补充描述">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="例如：保留原有光线方向"
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
        </Field>
      </div>

      <SubmitBar
        disabled={untouched}
        disabledHint="选择预设或调整角度后才能执行"
        credits={22}
        onReset={() => {
          setPreset(null)
          setOrbit(0)
          setPitch(0)
          setZoom(0)
          setExtra('')
        }}
        onCancel={onClose}
        onSubmit={() => {
          onSubmit({
            tool: 'multi-angle',
            label: '多角度',
            prompt: describe(),
            output: { resolution: '2K', quality: 'standard', count: 1, aspectRatio: '16:9' },
            credits: 22,
          })
          onClose()
        }}
      />
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Emotion — identifies a subject first, then positions it on two axes
 * ------------------------------------------------------------------ */

export function EmotionEditor({ open, imageUrl, onClose, onSubmit }: EditorProps) {
  const [stage, setStage] = useState<'detect' | 'position'>('detect')
  const [subject, setSubject] = useState<string | null>(null)
  const [point, setPoint] = useState({ x: 0, y: 0 })
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K')
  const [count, setCount] = useState<1 | 2 | 4>(1)

  // Deterministic stand-ins for a detector's output.
  const detected = ['人物 A（画面左侧）', '人物 B（画面中央）']

  const label = emotionLabel(point.x, point.y)

  return (
    <Dialog open={open} onClose={onClose} title="情绪调节" width={520} testId="emotion-editor">
      {stage === 'detect' ? (
        <div className="space-y-3">
          <p className="text-[12px] text-ink-500">先识别画面中的人物，再定位情绪。识别结果可直接选择，也可手动框选。</p>
          <div className="overflow-hidden rounded-xl bg-ink-900/95 p-3">
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="人物识别" className="mx-auto max-h-[200px] rounded-lg" />
            )}
          </div>
          <div className="space-y-1.5">
            {detected.map((person) => (
              <button
                key={person}
                type="button"
                onClick={() => {
                  setSubject(person)
                  setStage('position')
                }}
                className="w-full rounded-lg bg-ink-50 px-3 py-2.5 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-100"
              >
                {person}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSubject('手动框选区域')
                setStage('position')
              }}
              className="w-full rounded-lg border border-dashed border-ink-200 px-3 py-2.5 text-[13px] text-ink-500 hover:border-ink-300"
            >
              手动框选
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-[12px] text-ink-500">调节对象：{subject}</div>

          {/* Two-axis emotion pad. */}
          <div className="relative mx-auto aspect-square w-56 rounded-xl bg-ink-50">
            <div className="absolute left-1/2 top-0 h-full w-px bg-ink-200" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-ink-200" />
            <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] text-ink-400">激动</span>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-ink-400">平静</span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">疏离</span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">亲近</span>
            <button
              type="button"
              aria-label="情绪定位"
              className="absolute inset-0 cursor-crosshair"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setPoint({
                  x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                  y: 1 - ((e.clientY - rect.top) / rect.height) * 2,
                })
              }}
            />
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-4 ring-accent/20"
              style={{ left: `${((point.x + 1) / 2) * 100}%`, top: `${((1 - point.y) / 2) * 100}%` }}
            />
          </div>

          <div className="text-center text-[13px] font-medium text-ink-800" data-testid="emotion-label">
            {label}
          </div>

          <Field label="分辨率">
            <SegmentedControl
              size="sm"
              value={resolution}
              onChange={setResolution}
              options={[
                { value: '1K', label: '1K' },
                { value: '2K', label: '2K' },
                { value: '4K', label: '4K' },
              ]}
            />
          </Field>
          <Field label="生成数量">
            <SegmentedControl
              size="sm"
              value={String(count)}
              onChange={(v) => setCount(Number(v) as 1 | 2 | 4)}
              options={[
                { value: '1', label: '1 张' },
                { value: '2', label: '2 张' },
                { value: '4', label: '4 张' },
              ]}
            />
          </Field>
        </div>
      )}

      {stage === 'position' && (
        <SubmitBar
          credits={22 * count}
          onCancel={() => setStage('detect')}
          cancelLabel="返回"
          onSubmit={() => {
            onSubmit({
              tool: 'emotion',
              label: '情绪调节',
              prompt: `保持身份特征与构图不变，将${subject}的表情调整为「${label}」。`,
              output: { resolution, quality: 'standard', count, aspectRatio: '16:9' },
              credits: 22 * count,
            })
            onClose()
          }}
        />
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Panorama preview — a viewer, not a generator
 * ------------------------------------------------------------------ */

export function PanoramaViewer({
  open,
  imageUrl,
  onClose,
  onCapture,
}: {
  open: boolean
  imageUrl: string | null
  onClose: () => void
  onCapture: (views: number) => void
}) {
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [fov, setFov] = useState(75)

  return (
    <Dialog open={open} onClose={onClose} title="全景预览" width={620} testId="panorama-viewer">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl bg-ink-900" style={{ aspectRatio: '16 / 9' }}>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="全景预览"
              className="absolute left-1/2 top-1/2 max-w-none"
              style={{
                // Yaw pans horizontally, pitch vertically; fov drives the zoom.
                width: `${(360 / fov) * 100}%`,
                transform: `translate(calc(-50% - ${(yaw / 360) * 100}%), calc(-50% - ${(pitch / 180) * 100}%))`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
        </div>

        <Slider label="水平视角" min={-180} max={180} value={yaw} onChange={setYaw} format={(v) => `${v}°`} />
        <Slider label="垂直视角" min={-90} max={90} value={pitch} onChange={setPitch} format={(v) => `${v}°`} />
        <Slider label="视场" min={40} max={120} value={fov} onChange={setFov} format={(v) => `${v}°`} />

        <div className="flex gap-2">
          {[1, 4, 12].map((views) => (
            <button
              key={views}
              type="button"
              data-testid={`panorama-capture-${views}`}
              onClick={() => onCapture(views)}
              className="flex-1 rounded-lg bg-ink-100 py-2 text-[12px] text-ink-700 transition-colors hover:bg-ink-200"
            >
              {views === 1 ? '截取当前视角' : `截取 ${views} 大视角`}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function SubmitBar({
  disabled,
  disabledHint,
  credits,
  onSubmit,
  onCancel,
  onReset,
  cancelLabel = '取消',
}: {
  disabled?: boolean
  disabledHint?: string
  credits: number
  onSubmit: () => void
  onCancel: () => void
  onReset?: () => void
  cancelLabel?: string
}) {
  return (
    <div className="flex items-center gap-2 pt-5">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-3 py-2 text-[13px] text-ink-500 hover:bg-ink-50"
        >
          重置
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-[13px] text-ink-600 hover:bg-ink-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          data-testid="image-tool-submit"
          onClick={onSubmit}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-opacity',
            disabled ? 'cursor-not-allowed bg-ink-200 text-white' : 'bg-ink-900 text-white hover:opacity-85',
          )}
        >
          执行
          <span className="flex items-center gap-0.5 text-ink-300">
            <IconCredit size={12} />
            {credits}
          </span>
        </button>
      </div>
    </div>
  )
}
