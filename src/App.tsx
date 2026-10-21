import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MeterBar } from './components/MeterBar'
import { blip, setSoundEnabled, soundEnabled, subscribeSound } from './lib/sound'

const HnTicker = lazy(() => import('./tabs/HnTicker'))
const Adventure = lazy(() => import('./tabs/Adventure'))
const FindIt = lazy(() => import('./tabs/FindIt'))
const Audit = lazy(() => import('./tabs/Audit'))
const Tos = lazy(() => import('./tabs/Tos'))

const TABS = [
  { id: 'hn', label: 'HN Ticker', emoji: '🌶️', Component: HnTicker },
  { id: 'adventure', label: 'Adventure', emoji: '🧌', Component: Adventure },
  { id: 'find', label: 'Find It', emoji: '🔍', Component: FindIt },
  { id: 'audit', label: 'Design Audit', emoji: '📐', Component: Audit },
  { id: 'tos', label: 'TOS Red Flags', emoji: '🚩', Component: Tos },
] as const

type TabId = (typeof TABS)[number]['id']

function tabFromHash(): TabId {
  const id = window.location.hash.replace('#', '')
  return (TABS.find((t) => t.id === id)?.id ?? 'hn') as TabId
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const sound = useSyncExternalStore(subscribeSound, soundEnabled)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // On narrow screens the tab bar scrolls; keep the active tab in view.
  useEffect(() => {
    document
      .getElementById(`tab-${tab}`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  const select = (id: TabId) => {
    if (id === tab) return
    blip('tick')
    window.history.replaceState(null, '', `#${id}`)
    setTab(id)
  }

  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ✓
          </span>
          <div>
            <h1>Jev Demos</h1>
            <p className="tagline">A model that answers with decisions, not words.</p>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setSoundEnabled(!sound)}
          aria-pressed={sound}
          aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
          title={sound ? 'Sound on' : 'Sound off'}
        >
          {sound ? '🔊' : '🔇'}
        </button>
      </header>

      <nav className="tabs" role="tablist" aria-label="Demos">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            aria-controls={`panel-${t.id}`}
            id={`tab-${t.id}`}
            className={t.id === tab ? 'tab on' : 'tab'}
            onClick={() => select(t.id)}
          >
            {t.id === tab && (
              <motion.span
                layoutId="tab-pill"
                className="tab-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="tab-emoji" aria-hidden>
              {t.emoji}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main
        className="panel"
        role="tabpanel"
        id={`panel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <Suspense fallback={<div className="loading">Loading…</div>}>
              <active.Component />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <MeterBar />
    </div>
  )
}
