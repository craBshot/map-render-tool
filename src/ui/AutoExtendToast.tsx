import { useEffect } from 'react'
import { strings } from '../i18n'
import { useProjectStore } from '../state/store'
import type { ProjectFile } from '../state/types'
import type { TimedObject } from '../timeline/autoExtend'
import { fmtNum, routeLabel } from './format'
import styles from './AutoExtendToast.module.css'

const VISIBLE_MS = 8000

function causeLabel(cause: TimedObject, project: ProjectFile): string {
  if (cause.kind === 'route') {
    const index = project.routes.findIndex((r) => r.id === cause.id)
    return routeLabel(Math.max(0, index), project.routes.length)
  }
  if (cause.kind === 'area') return project.areas.find((a) => a.id === cause.id)?.name ?? ''
  return project.markers.find((m) => m.id === cause.id)?.name || strings.marker.namePlaceholder
}

/** Notice after the camera flight was auto-extended (store.ts / timeline/autoExtend.ts). Rendered inside the map stage. */
export function AutoExtendToast() {
  const notice = useProjectStore((s) => s.autoExtendNotice)
  const project = useProjectStore((s) => s.project)
  const t = strings.autoExtend

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useProjectStore.getState().dismissAutoExtendNotice(), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  if (!notice) return null
  return (
    <div className={styles.toast} role="status" data-testid="auto-extend-toast">
      <span>{t.message(fmtNum(notice.totalSec, 1), causeLabel(notice.cause, project))}</span>
      <button type="button" className={styles.action} onClick={() => useProjectStore.getState().undo()}>
        {t.undo}
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={() => useProjectStore.getState().dismissAutoExtendNotice()}
        aria-label={t.dismiss}
        title={t.dismiss}
      >
        ✕
      </button>
    </div>
  )
}
