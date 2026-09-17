import { useRef, useState } from 'react'
import { camAt } from '../../map/camera'
import { markerStateAt } from '../../map/markerAnimation'
import { downloadBlob } from '../../export/download'
import { ExportCancelledError, runExport } from '../../export/frameLoop'
import { isSecureContext } from '../../export/secureContext'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/store'
import type { ExportFormat, ResolutionPreset } from '../../state/types'
import { timingTotals } from '../../timeline/timing'
import { strings } from '../../i18n'
import { fmtNum } from '../format'
import styles from './panel.module.css'

const RESOLUTION_PRESETS: { value: ResolutionPreset; width: number; height: number }[] = [
  { value: '1920x1080', width: 1920, height: 1080 },
  { value: '3840x2160', width: 3840, height: 2160 },
  { value: '1080x1920', width: 1080, height: 1920 },
  { value: '1080x1080', width: 1080, height: 1080 },
  { value: '2160x2160', width: 2160, height: 2160 },
  { value: '1080x1350', width: 1080, height: 1350 },
]
const FPS_OPTIONS = [24, 25, 30, 50, 60] as const
const FORMATS: ExportFormat[] = ['mp4', 'jpeg', 'png']
const QUALITY_OPTIONS = [
  { value: 0.2, key: 'normal' },
  { value: 0.35, key: 'high' },
  { value: 0.6, key: 'veryHigh' },
] as const

export function ExportPanel() {
  const exportSettings = useProjectStore((s) => s.project.export)
  const setProject = useProjectStore((s) => s.setProject)
  const locked = useEditorStore((s) => s.locked)
  const t = strings.export

  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const cancelledRef = useRef(false)

  function update<K extends keyof typeof exportSettings>(field: K, value: (typeof exportSettings)[K]) {
    setProject((p) => ({ ...p, export: { ...p.export, [field]: value } }))
  }

  function selectResolution(value: ResolutionPreset) {
    const preset = RESOLUTION_PRESETS.find((r) => r.value === value)
    setProject((p) => ({
      ...p,
      export: {
        ...p.export,
        resolution: preset
          ? { preset: value, width: preset.width, height: preset.height }
          : { ...p.export.resolution, preset: value },
      },
    }))
  }

  function clampCustomDimension(value: number): number {
    return Math.min(4096, Math.max(200, Math.round(value / 2) * 2))
  }

  async function handleExport() {
    if (locked) return
    const controller = useEditorStore.getState().controller
    if (!controller) return

    cancelledRef.current = false
    setIsError(false)
    setMessage('')
    useEditorStore.getState().setLocked(true)
    const project = useProjectStore.getState().project

    try {
      const { blob, ext, totalFrames } = await runExport({
        controller,
        project,
        onProgress: setMessage,
        isCancelled: () => cancelledRef.current,
      })
      downloadBlob(blob, `kartenzoom_${project.export.resolution.width}x${project.export.resolution.height}_${project.export.fps}fps.${ext}`)
      const mb = fmtNum(blob.size / 1048576, 1)
      setMessage(
        ext === 'mp4' ? t.doneMp4(fmtNum(totalFrames / project.export.fps, 1), mb) : t.doneImages(totalFrames, mb),
      )
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        setMessage(t.cancelledMessage)
      } else {
        setIsError(true)
        setMessage(`${t.failedPrefix}${err instanceof Error ? err.message : String(err)}.`)
      }
    } finally {
      useEditorStore.getState().setLocked(false)
      const totals = timingTotals(project.camera.timing)
      controller.renderMarkers(project.markers.map((marker) => ({ marker, frame: markerStateAt(marker, totals, null) })))
      controller.applyCameraFrame(camAt(project.camera, 1))
    }
  }

  function handleCancel() {
    cancelledRef.current = true
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t.heading}</h2>

      <div className={styles.row}>
        <div>
          <label className={styles.label} htmlFor="exportResolution">
            {t.resolution}
          </label>
          <select
            id="exportResolution"
            className={styles.select}
            value={exportSettings.resolution.preset}
            onChange={(e) => selectResolution(e.target.value as ResolutionPreset)}
            disabled={locked}
          >
            {RESOLUTION_PRESETS.map((r) => (
              <option key={r.value} value={r.value}>
                {t.resolutionPresets[r.value]}
              </option>
            ))}
            <option value="custom">{t.resolutionPresets.custom}</option>
          </select>
        </div>
        <div>
          <label className={styles.label} htmlFor="exportFps">
            {t.fps}
          </label>
          <select
            id="exportFps"
            className={styles.select}
            value={exportSettings.fps}
            onChange={(e) => update('fps', Number(e.target.value) as (typeof FPS_OPTIONS)[number])}
            disabled={locked}
          >
            {FPS_OPTIONS.map((fps) => (
              <option key={fps} value={fps}>
                {fps}
              </option>
            ))}
          </select>
        </div>
      </div>

      {exportSettings.resolution.preset === 'custom' && (
        <div className={styles.row}>
          <div>
            <label className={styles.label} htmlFor="exportWidth">
              {t.width}
            </label>
            <input
              id="exportWidth"
              type="number"
              className={styles.input}
              min={200}
              max={4096}
              step={2}
              value={exportSettings.resolution.width}
              disabled={locked}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  export: { ...p.export, resolution: { ...p.export.resolution, width: clampCustomDimension(Number(e.target.value)) } },
                }))
              }
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="exportHeight">
              {t.height}
            </label>
            <input
              id="exportHeight"
              type="number"
              className={styles.input}
              min={200}
              max={4096}
              step={2}
              value={exportSettings.resolution.height}
              disabled={locked}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  export: { ...p.export, resolution: { ...p.export.resolution, height: clampCustomDimension(Number(e.target.value)) } },
                }))
              }
            />
          </div>
        </div>
      )}

      <label className={styles.label} htmlFor="exportFormat">
        {t.format}
      </label>
      <select
        id="exportFormat"
        className={styles.select}
        value={exportSettings.format}
        onChange={(e) => update('format', e.target.value as ExportFormat)}
        disabled={locked}
      >
        {FORMATS.map((format) => (
          <option key={format} value={format}>
            {t.formats[format]}
          </option>
        ))}
      </select>

      {exportSettings.format === 'mp4' && !isSecureContext() && <p className={styles.hint}>{t.secureContextWarning}</p>}

      {exportSettings.format === 'mp4' && (
        <>
          <label className={styles.label} htmlFor="exportQuality">
            {t.quality}
          </label>
          <select
            id="exportQuality"
            className={styles.select}
            value={exportSettings.quality}
            onChange={(e) => update('quality', Number(e.target.value))}
            disabled={locked}
          >
            {QUALITY_OPTIONS.map((q) => (
              <option key={q.key} value={q.value}>
                {t.qualityLevels[q.key]}
              </option>
            ))}
          </select>
        </>
      )}

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={exportSettings.showAttribution}
          disabled={locked}
          onChange={(e) => update('showAttribution', e.target.checked)}
        />
        {t.showAttribution}
      </label>
      <p className={styles.hint}>{t.attributionHint}</p>

      <div className={styles.btns} style={{ marginTop: 12 }}>
        <button type="button" className={styles.button} onClick={handleExport} disabled={locked}>
          {t.exportButton}
        </button>
        <button type="button" className={styles.button} onClick={handleCancel} disabled={!locked}>
          {t.cancelButton}
        </button>
      </div>
      {message && <p className={isError ? styles.msgErr : styles.msg}>{message}</p>}
    </section>
  )
}
