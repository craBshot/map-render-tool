import { useRef } from 'react'
import { useEditorStore } from '../state/editorStore'
import { ProjectFileDropZone } from './ProjectFileDropZone'
import { Sidebar } from './Sidebar/Sidebar'
import { Splitter } from './Splitter'
import { MapStage } from './Stage/MapStage'
import { Timeline } from './Timeline/Timeline'
import { useUndoShortcuts } from './useUndoShortcuts'
import styles from './App.module.css'

export function App() {
  const sidebarWidthPx = useEditorStore((s) => s.sidebarWidthPx)
  const timelineHeightPx = useEditorStore((s) => s.timelineHeightPx)
  const timelineWrapperRef = useRef<HTMLDivElement>(null)
  useUndoShortcuts()

  const sidebarStartRef = useRef<number | null>(null)
  function resizeSidebar(deltaPx: number) {
    if (sidebarStartRef.current === null) sidebarStartRef.current = useEditorStore.getState().sidebarWidthPx
    useEditorStore.getState().setSidebarWidthPx(sidebarStartRef.current + deltaPx)
  }

  const timelineStartRef = useRef<number | null>(null)
  function resizeTimeline(deltaPx: number) {
    if (timelineStartRef.current === null) {
      // First drag ever (timelineHeightPx still null/auto): measure the Timeline's current rendered
      // height as the starting point, so the first drag doesn't jump from an arbitrary base value.
      const current = useEditorStore.getState().timelineHeightPx
      timelineStartRef.current = current ?? timelineWrapperRef.current?.getBoundingClientRect().height ?? 200
    }
    // Dragging the divider up (negative deltaPx) should grow the Timeline, hence the minus.
    useEditorStore.getState().setTimelineHeightPx(timelineStartRef.current - deltaPx)
  }

  return (
    <div className={styles.app} style={{ gridTemplateColumns: `${sidebarWidthPx}px 6px 1fr` }}>
      <Sidebar />
      <Splitter
        axis="x"
        onResize={resizeSidebar}
        onResizeEnd={() => (sidebarStartRef.current = null)}
        className={styles.sidebarSplitter}
      />
      <main
        className={styles.main}
        style={{ gridTemplateRows: `1fr 6px ${timelineHeightPx === null ? 'auto' : `${timelineHeightPx}px`}` }}
      >
        <MapStage />
        <Splitter axis="y" onResize={resizeTimeline} onResizeEnd={() => (timelineStartRef.current = null)} />
        <div ref={timelineWrapperRef} className={styles.timelineWrapper}>
          <Timeline />
        </div>
      </main>
      <ProjectFileDropZone />
    </div>
  )
}
