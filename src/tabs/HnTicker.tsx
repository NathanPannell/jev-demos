import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { ErrorNote, Hook, ProbBar, Ticker } from '../components/ui'
import { askJev, JevError, noul } from '../lib/jev'
import { fetchComments, HOT_TAKE_QUESTION, type HnComment } from '../lib/hn'
import { formatMs, formatUsd } from '../lib/format'
import { blip } from '../lib/sound'

interface Item {
  c: HnComment
  live: boolean
  p: number | null
  latencyMs?: number
}

const FIREHOSE_SIZE = 7
const HOT_SIZE = 24
const PACE_MS = 280
const MAX_IN_FLIGHT = 4
const POLL_MS = 12_000
const AUTO_PAUSE_MS = 120_000
const HIT = 0.5

function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const pageVisible = () => document.visibilityState === 'visible'

export default function HnTicker() {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible)
  const [playing, setPlaying] = useState(false)
  const [firehose, setFirehose] = useState<Item[]>([])
  const [hot, setHot] = useState<Item[]>([])
  const [stats, setStats] = useState({ classified: 0, hits: 0, cost: 0, latency: 0 })
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const queue = useRef<{ c: HnComment; live: boolean }[]>([])
  const seen = useRef(new Set<string>())
  const newest = useRef(0)
  const page = useRef(0)
  const inFlight = useRef(0)
  const fetching = useRef(false)
  const playStart = useRef(0)

  const enqueue = useCallback((comments: HnComment[], live: boolean, front: boolean) => {
    const fresh = comments.filter((c) => !seen.current.has(c.id))
    fresh.forEach((c) => seen.current.add(c.id))
    for (const c of comments) newest.current = Math.max(newest.current, c.createdAt)
    const items = fresh.map((c) => ({ c, live }))
    queue.current = front ? [...items, ...queue.current] : [...queue.current, ...items]
  }, [])

  const refill = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    try {
      // Oldest first, so the stream reads forward in time.
      const comments = await fetchComments({ page: page.current })
      page.current += 1
      enqueue([...comments].reverse(), false, false)
    } catch {
      setError('Could not reach the Hacker News API. Retrying…')
    } finally {
      fetching.current = false
    }
  }, [enqueue])

  const classify = useCallback(async (item: { c: HnComment; live: boolean }) => {
    inFlight.current += 1
    setFirehose((f) => [{ ...item, p: null }, ...f].slice(0, FIREHOSE_SIZE))
    try {
      const r = await askJev('hn', {
        state: item.c.text,
        questions: { hot: { type: 'noul', instructions: HOT_TAKE_QUESTION } },
      })
      const p = noul(r, 'hot')
      const done: Item = { ...item, p, latencyMs: r.latencyMs }
      setStats((s) => ({
        classified: s.classified + 1,
        hits: s.hits + (p > HIT ? 1 : 0),
        cost: s.cost + r.usage.cost,
        latency: s.latency + r.latencyMs,
      }))
      setFirehose((f) => f.map((x) => (x.c.id === item.c.id ? done : x)))
      if (p > HIT) {
        blip('hit')
        // Let the bar fill, then fly the card into the hot lane.
        setTimeout(() => {
          setFirehose((f) => f.filter((x) => x.c.id !== item.c.id))
          setHot((h) => [done, ...h].slice(0, HOT_SIZE))
        }, 650)
      } else {
        blip('tick')
      }
    } catch (err) {
      setFirehose((f) => f.filter((x) => x.c.id !== item.c.id))
      if (err instanceof JevError && (err.status === 429 || err.status === 503)) {
        setError(err.message)
        setPlaying(false)
      }
    } finally {
      inFlight.current -= 1
    }
  }, [])

  const running = playing && visible

  // Pacer: pull from the queue at a steady clip.
  useEffect(() => {
    if (!running) return
    if (queue.current.length === 0) void refill()
    const pace = setInterval(() => {
      if (Date.now() - playStart.current > AUTO_PAUSE_MS) {
        setPlaying(false)
        setNote('Paused after two minutes to save tokens. Press play to keep going.')
        return
      }
      if (queue.current.length < 12) void refill()
      if (inFlight.current >= MAX_IN_FLIGHT) return
      const next = queue.current.shift()
      if (next) void classify(next)
    }, PACE_MS)
    return () => clearInterval(pace)
  }, [running, refill, classify])

  // Live poll: brand-new comments jump the queue.
  useEffect(() => {
    if (!running) return
    const poll = setInterval(async () => {
      try {
        const fresh = await fetchComments({ after: newest.current })
        if (fresh.length) enqueue([...fresh].reverse(), true, true)
      } catch {
        // the pacer's refill reports errors
      }
    }, POLL_MS)
    return () => clearInterval(poll)
  }, [running, enqueue])

  const toggle = () => {
    blip('pop')
    setNote(null)
    setError(null)
    if (!playing) playStart.current = Date.now()
    setPlaying(!playing)
  }

  const hitRate = stats.classified ? stats.hits / stats.classified : 0
  const avgCost = stats.classified ? stats.cost / stats.classified : 0
  const avgLatency = stats.classified ? stats.latency / stats.classified : 0

  return (
    <section className="hn">
      <Hook title="Classify a million comments for pocket change.">
        Live Hacker News comments stream in. Jev asks one yes/no question of each:{' '}
        <em>“{HOT_TAKE_QUESTION}”</em>
      </Hook>

      <div className="hn-controls">
        <motion.button
          className={playing ? 'play-btn on' : 'play-btn'}
          onClick={toggle}
          whileTap={{ scale: 0.92 }}
          aria-label={playing ? 'Pause the stream' : 'Play the stream'}
        >
          <span aria-hidden>{playing ? '❚❚' : '▶'}</span> {playing ? 'Pause' : 'Play'}
        </motion.button>
        {playing && !visible && <span className="hint">Paused while this tab is hidden</span>}
        {playing && visible && (
          <span className="live-dot">
            <span className="dot" /> streaming
          </span>
        )}
      </div>
      <ErrorNote message={error} />
      {note && <p className="hint">{note}</p>}

      <div className="hn-stats">
        <Stat label="classified">
          <Ticker value={stats.classified} format={(n) => Math.round(n).toLocaleString()} />
        </Stat>
        <Stat label="hot takes" tone="hot">
          <Ticker value={stats.hits} format={(n) => Math.round(n).toLocaleString()} />
          <small> {Math.round(hitRate * 100)}%</small>
        </Stat>
        <Stat label="spent">
          <Ticker value={stats.cost} format={(n) => formatUsd(n, 8)} className="mono" />
        </Stat>
        <Stat label="per million comments">
          <Ticker value={avgCost * 1_000_000} format={(n) => `$${n.toFixed(2)}`} />
        </Stat>
        <Stat label="avg latency">{stats.classified ? formatMs(avgLatency) : '–'}</Stat>
      </div>

      <LayoutGroup>
        <div className="lanes">
          <div className="lane">
            <h3>Firehose</h3>
            {firehose.length === 0 && !playing && (
              <p className="empty">Press play to open the firehose.</p>
            )}
            <AnimatePresence initial={false} mode="popLayout">
              {firehose.map((item) => (
                <CommentCard key={item.c.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
          <div className="lane lane-hot">
            <h3>🌶️ Hot takes</h3>
            {hot.length === 0 && <p className="empty">Spicy comments land here.</p>}
            <AnimatePresence initial={false} mode="popLayout">
              {hot.map((item) => (
                <CommentCard key={item.c.id} item={item} hot />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </LayoutGroup>
    </section>
  )
}

function Stat({
  label,
  tone,
  children,
}: {
  label: string
  tone?: 'hot'
  children: React.ReactNode
}) {
  return (
    <div className={tone ? `stat stat-${tone}` : 'stat'}>
      <div className="stat-value">{children}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function CommentCard({ item, hot = false }: { item: Item; hot?: boolean }) {
  const done = item.p !== null
  const isHit = done && item.p! > HIT
  const cls = [
    'comment',
    isHit ? 'is-hit' : '',
    done && !isHit ? 'is-miss' : '',
    hot ? 'in-hot' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <motion.article
      layout
      layoutId={item.c.id}
      className={cls}
      initial={{ opacity: 0, x: -40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <header>
        <span className="author">{item.c.author}</span>
        {item.live && <span className="live-tag">LIVE</span>}
        <span className="story">{item.c.storyTitle}</span>
      </header>
      <p>{item.c.text}</p>
      <ProbBar p={item.p} tone={isHit ? 'hot' : done ? 'muted' : 'accent'} label="hot take" />
    </motion.article>
  )
}
