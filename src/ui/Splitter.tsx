import { useDragAxis } from './useDragAxis'
import styles from './Splitter.module.css'

export interface SplitterProps {
  /** 'x' = a vertical divider (drag left/right, e.g. Sidebar/main); 'y' = a horizontal divider (drag up/down, e.g. MapStage/Timeline). */
  axis: 'x' | 'y'
  /** Called with the raw pixel delta from where THIS gesture started (cumulative, not incremental), on every move. */
  onResize: (deltaPx: number) => void
  /** Called once the gesture ends — callers use this to reset their own "size at gesture start" reference. */
  onResizeEnd?: () => void
  /** Extra class from the caller — e.g. to hide a splitter at a layout breakpoint where it no longer applies. */
  className?: string
}

/** A thin, draggable divider between two panes. Purely a UI/layout affordance — carries no project state itself. */
export function Splitter({ axis, onResize, onResizeEnd, className }: SplitterProps) {
  const { startDrag } = useDragAxis(axis, onResize, onResizeEnd)

  return (
    <div
      className={`${axis === 'x' ? styles.splitterX : styles.splitterY} ${className ?? ''}`}
      onPointerDown={startDrag}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    />
  )
}
