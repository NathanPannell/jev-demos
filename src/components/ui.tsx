import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Box } from '../lib/jev'
import { formatPct } from '../lib/format'
import { ZOOM_SPRING } from '../lib/zoom'

export function Hook({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hook">
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {title}
      </motion.h2>
      {children && <p>{children}</p>}
    </div>
  )
}

export function ProbBar({
  p,
  tone = 'accent',
  label,
}: {
  p: number | null
  tone?: 'accent' | 'hot' | 'warn' | 'muted'
  label?: string
}) {
  return (
    <div className={`prob prob-${tone}`} aria-label={label} role="meter" aria-valuenow={p ?? 0}>
      <motion.div
        className="prob-fill"
        initial={{ width: 0 }}
        animate={{ width: `${(p ?? 0) * 100}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      />
      {p !== null && <span className="prob-num">{formatPct(p)}</span>}
    </div>
  )
}

/** A number that eases towards its target, for juicy counters. */
export function Ticker({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450)
      const eased = 1 - Math.pow(1 - k, 3)
      const v = a + (value - a) * eased
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={className}>{format(shown)}</span>
}

/**
 * Animated bounding box. Coordinates are 0-1 fractions of the visible stage, so the border and
 * label keep their size while the image underneath zooms.
 */
export function BoxOverlay({
  box,
  label,
  tone = 'accent',
  dashed = false,
}: {
  box: Box
  label?: string
  tone?: 'accent' | 'hot'
  dashed?: boolean
}) {
  return (
    <motion.div
      className="box-pos"
      initial={false}
      animate={{
        left: `${box.left * 100}%`,
        top: `${box.top * 100}%`,
        width: `${Math.max(0.01, box.right - box.left) * 100}%`,
        height: `${Math.max(0.01, box.bottom - box.top) * 100}%`,
      }}
      transition={ZOOM_SPRING}
    >
      <motion.div
        className={`box-overlay box-${tone}${dashed ? ' box-dashed' : ''}`}
        initial={{ opacity: 0, scale: 2.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        <span className="box-corner tl" />
        <span className="box-corner tr" />
        <span className="box-corner bl" />
        <span className="box-corner br" />
        {label && (
          <motion.span
            className={box.top < 0.12 ? 'box-label below' : 'box-label'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            {label}
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  )
}

export function Scanning() {
  return <div className="scanning" aria-hidden />
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <motion.p
      className="error-note"
      role="alert"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
      transition={{ duration: 0.35 }}
    >
      {message}
    </motion.p>
  )
}

export function CallStat({ latencyMs, cost }: { latencyMs: number; cost: number }) {
  return (
    <span className="call-stat">
      {Math.round(latencyMs)} ms · ${cost.toFixed(8)}
    </span>
  )
}
