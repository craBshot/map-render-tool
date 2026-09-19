import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export interface UseHorizontalDragResult {
  dragging: boolean
  /** Attach to the track element's onPointerDown. */
  startDrag: (e: ReactPointerEvent<HTMLElement>) => void
}

/**
 * Horizontal-only pointer drag over a track element. Measures the track's
 * bounding rect once, at pointerdown (nothing resizes mid-drag, so no
 * ResizeObserver needed). Reports fracX (0..1, clamped) on every move.
 * Used by both the Timeline's playhead scrub and whole-bar dragging —
 * a single hook keeps that "measure once, report a clamped fraction"
 * convention from silently diverging between the two call sites. The
 * *interpretation* of fracX (absolute seek vs. relative delta-from-start)
 * stays in each caller, not here.
 */
export function useHorizontalDrag(
  trackRef: RefObject<HTMLElement | null>,
  onDrag: (fracX: number) => void,
  onDragEnd?: () => void,
): UseHorizontalDragResult {
  const [dragging, setDragging] = useState(false)
  const widthRef = useRef(0)
  const leftRef = useRef(0)

  const fracXFromClientX = useCallback((clientX: number) => {
    if (widthRef.current === 0) return 0
    return Math.min(1, Math.max(0, (clientX - leftRef.current) / widthRef.current))
  }, [])

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      leftRef.current = rect.left
      widthRef.current = rect.width
      setDragging(true)

      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      onDrag(fracXFromClientX(e.clientX))

      const handleMove = (ev: PointerEvent) => onDrag(fracXFromClientX(ev.clientX))
      const handleUp = () => {
        setDragging(false)
        target.removeEventListener('pointermove', handleMove)
        target.removeEventListener('pointerup', handleUp)
        onDragEnd?.()
      }
      target.addEventListener('pointermove', handleMove)
      target.addEventListener('pointerup', handleUp)
    },
    [trackRef, onDrag, onDragEnd, fracXFromClientX],
  )

  return { dragging, startDrag }
}
