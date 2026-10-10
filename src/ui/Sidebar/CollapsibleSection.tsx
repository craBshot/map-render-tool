import type { ReactNode } from 'react'
import { useEditorStore, type SidebarSectionKey } from '../../state/editorStore'
import styles from './panel.module.css'

/**
 * Shared <details>/<summary> wrapper for every Sidebar panel — open state
 * lives in editorStore.openSidebarSections (keyed per panel) rather than
 * being a plain uncontrolled DOM attribute, so it can be forced open
 * programmatically (e.g. a right-click area-pick, or a future map
 * double-click-to-edit) instead of only ever toggling via the user's own
 * click on the <summary>.
 */
export function CollapsibleSection({
  sectionKey,
  heading,
  children,
}: {
  sectionKey: SidebarSectionKey
  heading: string
  children: ReactNode
}) {
  const open = useEditorStore((s) => s.openSidebarSections[sectionKey])
  return (
    <details
      className={styles.section}
      data-section={sectionKey}
      open={open}
      onToggle={(e) => useEditorStore.getState().setSidebarSectionOpen(sectionKey, e.currentTarget.open)}
    >
      <summary className={styles.heading}>{heading}</summary>
      {children}
    </details>
  )
}
