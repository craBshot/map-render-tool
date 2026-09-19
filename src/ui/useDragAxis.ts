import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export interface UseDragAxisResult {
  dragging: boolean
  /** Attach to the drag handle's onPointerDown. */
  startDrag: (e: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Single-axis pointer drag reporting the raw pixel delta from where the
 * gesture started (not an absolute position within a track — see
 * useHorizontalDrag.ts for that variant, used by the Timeline's scrubber/
 * bars). Same low-level shape (measure the starting pointer position once,
 * setPointerCapture, report per move, clean up on release) — kept as its
 * own hook rather than merged into useHorizontalDrag because the two
 * report fundamentally different things (delta vs. absolute fraction) and
 * that one is already shipped/tested; not worth the risk of reworking it
 * just to share one more hook.
 */
export function useDragAxis(axis: 'x' | 'y', onDrag: (deltaPx: number) => void, onDragEnd?: () => void): UseDragAxisResult {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(0)

  const posFromEvent = useCallback((e: { clientX: number; clientY: number }) => (axis === 'x' ? e.clientX : e.clientY), [axis])

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      startRef.current = posFromEvent(e)
      setDragging(true)

      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      const handleMove = (ev: PointerEvent) => onDrag(posFromEvent(ev) - startRef.current)
      const handleUp = () => {
        setDragging(false)
        target.removeEventListener('pointermove', handleMove)
        target.removeEventListener('pointerup', handleUp)
        onDragEnd?.()
      }
      target.addEventListener('pointermove', handleMove)
      target.addEventListener('pointerup', handleUp)
    },
    [onDrag, onDragEnd, posFromEvent],
  )

  return { dragging, startDrag }
}
