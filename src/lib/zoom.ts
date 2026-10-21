import type { Box } from './jev'

/** Scale and offset (fractions of the stage) that bring `box` to the centre, filling ~60% of the view. */
export function zoomFor(box: Box | null): { scale: number; x: number; y: number } {
  if (!box) return { scale: 1, x: 0, y: 0 }
  const w = Math.max(0.02, box.right - box.left)
  const h = Math.max(0.02, box.bottom - box.top)
  const scale = Math.min(4, Math.max(1, 0.6 / Math.max(w, h)))
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  const clamp = (v: number) => Math.min(0, Math.max(1 - scale, v))
  return { scale, x: clamp(0.5 - cx * scale), y: clamp(0.5 - cy * scale) }
}

/** Spring shared by the stage zoom and the box that rides on top of it. */
export const ZOOM_SPRING = { type: 'spring', stiffness: 90, damping: 20, mass: 0.9 } as const
