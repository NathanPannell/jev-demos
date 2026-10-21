import { useSyncExternalStore } from 'react'
import { motion } from 'motion/react'
import { meter } from '../lib/jev'
import { formatMs, formatUsd } from '../lib/format'

/** Subtle footer: the latency and cost of the last Jev call, plus the session total. */
export function MeterBar() {
  const s = useSyncExternalStore(meter.subscribe, meter.getSnapshot)
  return (
    <footer className="meter" aria-live="polite">
      <span className="meter-model">
        <span className="dot" /> typesafe/jev-1.14 via OpenRouter
      </span>
      {s.last && (
        <span className="meter-last">
          last call{' '}
          <motion.b key={s.calls} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }}>
            {formatMs(s.last.latencyMs)} · {formatUsd(s.last.cost)}
          </motion.b>
        </span>
      )}
      <span className="meter-total">
        {s.calls} calls · {formatUsd(s.totalCost)} this visit
      </span>
    </footer>
  )
}
