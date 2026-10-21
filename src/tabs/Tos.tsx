import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CallStat, ErrorNote, Hook } from '../components/ui'
import { SAMPLE_TOS, SAMPLE_TOS_NAME } from '../data/tos'
import { askJev, mapLimit, noul, type ChoiceAnswer, type ScoreAnswer } from '../lib/jev'
import { FLAG_KINDS, severity, splitClauses, UNFAIR_QUESTION, type FlagKind } from '../lib/tos'
import { formatPct, formatUsd } from '../lib/format'
import { blip } from '../lib/sound'

interface Verdict {
  p: number
  kind: FlagKind
}

const KIND_CRITERIA = Object.fromEntries(
  Object.entries(FLAG_KINDS).map(([k, v]) => [k, v.criterion]),
)
const SCORE_LEVELS = ['Fair', 'Mostly fair', 'Some concerns', 'Hostile', 'Predatory']
const ASK_EXAMPLES = [
  'Can they sell my personal data?',
  'Can I get a refund?',
  'Can they change these terms without telling me?',
  'Can I sue them in court?',
]
const SWEEP_MS = 90

export default function Tos() {
  const [doc, setDoc] = useState(SAMPLE_TOS)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const clauses = useMemo(() => splitClauses(doc), [doc])
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({})
  const [cursor, setCursor] = useState(-1)
  const [scanning, setScanning] = useState(false)
  const [overall, setOverall] = useState<ScoreAnswer | null>(null)
  const [spent, setSpent] = useState({ cost: 0, calls: 0, latency: 0 })
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{
    q: string
    p: number
    latencyMs: number
    cost: number
  } | null>(null)
  const [asking, setAsking] = useState(false)
  const runId = useRef(0)
  const clauseEls = useRef(new Map<number, HTMLElement>())
  const docRef = useRef<HTMLDivElement>(null)

  // The highlighter sweeps forward as soon as the next clause has a verdict.
  useEffect(() => {
    if (cursor < 0 || cursor >= clauses.length) return
    const t = setTimeout(() => {
      const c = clauses[cursor]
      if (c.heading || verdicts[c.id]) {
        const v = verdicts[c.id]
        if (v && severity(v.p) === 'red') blip('hit')
        setCursor(cursor + 1)
      }
    }, SWEEP_MS)
    return () => clearTimeout(t)
  }, [cursor, clauses, verdicts])

  // Keep the highlighter in view by scrolling the document pane (not the page).
  useEffect(() => {
    const pane = docRef.current
    const at = pane?.querySelector<HTMLElement>('.sweep-at')
    if (!pane || !at) return
    const target = at.offsetTop - pane.clientHeight * 0.4
    if (Math.abs(pane.scrollTop - target) > 40) pane.scrollTo({ top: target, behavior: 'smooth' })
  }, [cursor])

  async function scan() {
    const id = ++runId.current
    setVerdicts({})
    setOverall(null)
    setSpent({ cost: 0, calls: 0, latency: 0 })
    setError(null)
    setScanning(true)
    setCursor(0)
    blip('whoosh')
    const track = (cost: number, latency: number) =>
      setSpent((s) => ({ cost: s.cost + cost, calls: s.calls + 1, latency: s.latency + latency }))

    const whole = askJev('tos', {
      state: doc,
      questions: {
        hostile: {
          type: 'score',
          instructions: 'Overall, how user-hostile is this terms of service?',
          criteria: SCORE_LEVELS,
        },
      },
    }).then((r) => {
      if (id !== runId.current) return
      track(r.usage.cost, r.latencyMs)
      setOverall(r.answers.hostile as ScoreAnswer)
    })

    const body = clauses.filter((c) => !c.heading)
    const each = mapLimit(body, 6, async (c) => {
      const r = await askJev('tos', {
        state: c.text,
        questions: {
          unfair: { type: 'noul', instructions: UNFAIR_QUESTION },
          kind: {
            type: 'choice',
            instructions: 'What is this terms-of-service clause mainly about?',
            criteria: KIND_CRITERIA,
          },
        },
      })
      if (id !== runId.current) return
      track(r.usage.cost, r.latencyMs)
      const kind = (r.answers.kind as ChoiceAnswer).choice as FlagKind
      setVerdicts((v) => ({ ...v, [c.id]: { p: noul(r, 'unfair'), kind } }))
    })

    try {
      await Promise.all([whole, each])
    } catch (err) {
      if (id === runId.current) setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      if (id === runId.current) setScanning(false)
    }
  }

  async function ask(q: string) {
    const text = q.trim()
    if (!text || asking) return
    setQuestion(text)
    setAsking(true)
    setError(null)
    try {
      const r = await askJev('tos', {
        state: doc,
        questions: {
          a: { type: 'noul', instructions: `According to this terms of service: ${text}` },
        },
      })
      setAnswer({ q: text, p: noul(r, 'a'), latencyMs: r.latencyMs, cost: r.usage.cost })
      blip('pop')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setAsking(false)
    }
  }

  function applyPasted() {
    const text = draft.trim()
    if (text.length < 200) {
      setError('Paste at least a few paragraphs of terms.')
      return
    }
    runId.current++
    setDoc(text.slice(0, 110_000))
    setEditing(false)
    setVerdicts({})
    setOverall(null)
    setCursor(-1)
    setAnswer(null)
    setScanning(false)
  }

  const revealed = (i: number) => cursor > i || (cursor >= clauses.length && cursor >= 0)
  const flags = clauses.filter(
    (c, i) => revealed(i) && verdicts[c.id] && severity(verdicts[c.id].p) !== 'ok',
  )
  const reds = flags.filter((c) => severity(verdicts[c.id].p) === 'red').length

  return (
    <section className="tos">
      <Hook title="Nobody reads the terms. Jev reads every line.">
        Each clause gets a yes/no (“is this unfair?”) and a reason tag. Red means watch out. Yellow
        means worth a look.
      </Hook>

      <div className="tos-actions">
        <motion.button
          className="primary-btn big"
          onClick={() => void scan()}
          disabled={scanning || editing}
          whileTap={{ scale: 0.95 }}
        >
          {scanning ? 'Scanning…' : cursor >= 0 ? 'Scan again' : '🖍️ Scan for red flags'}
        </motion.button>
        <button
          className="ghost-btn"
          onClick={() => {
            setDraft('')
            setEditing(!editing)
          }}
        >
          {editing ? 'Cancel' : 'Paste your own TOS'}
        </button>
        {doc !== SAMPLE_TOS && !editing && (
          <button
            className="ghost-btn"
            onClick={() => {
              runId.current++
              setDoc(SAMPLE_TOS)
              setVerdicts({})
              setCursor(-1)
              setOverall(null)
              setAnswer(null)
            }}
          >
            Back to the sample
          </button>
        )}
      </div>
      <ErrorNote message={error} />

      <div className="tos-layout">
        <div className="tos-doc" ref={docRef}>
          {editing ? (
            <div className="paste">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste a terms of service, privacy policy or contract…"
                aria-label="Paste your own terms"
                maxLength={110_000}
              />
              <button className="primary-btn" onClick={applyPasted}>
                Use this text
              </button>
            </div>
          ) : (
            <article
              aria-label={`Terms of service for ${doc === SAMPLE_TOS ? SAMPLE_TOS_NAME : 'your document'}`}
            >
              {clauses.map((c, i) => {
                const v = verdicts[c.id]
                const shown = revealed(i) && v
                const sev = shown ? severity(v.p) : null
                if (c.heading) {
                  return (
                    <h4 key={c.id} className={cursor === i ? 'sweep-at' : ''}>
                      {c.text}
                    </h4>
                  )
                }
                return (
                  <p
                    key={c.id}
                    ref={(el) => {
                      if (el) clauseEls.current.set(c.id, el)
                    }}
                    className={['clause', sev ? `hl-${sev}` : '', cursor === i ? 'sweep-at' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="clause-text">{c.text}</span>
                    {sev && sev !== 'ok' && (
                      <motion.span
                        className={`flag-tag tag-${sev}`}
                        initial={{ opacity: 0, scale: 0.6, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      >
                        {sev === 'red' ? '🚩' : '⚠️'}{' '}
                        {v.kind === 'ordinary' ? 'Worth a look' : FLAG_KINDS[v.kind].label} ·{' '}
                        {formatPct(v.p)}
                      </motion.span>
                    )}
                  </p>
                )
              })}
            </article>
          )}
        </div>

        <aside className="tos-side">
          <div className="tos-summary">
            <div className="big-count">
              <motion.span key={reds} initial={{ scale: 1.6 }} animate={{ scale: 1 }}>
                {reds}
              </motion.span>
              <small>red flags</small>
            </div>
            {overall && (
              <motion.div
                className="overall"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Whole document: <b>{SCORE_LEVELS[Math.round(overall.score)] ?? '?'}</b>{' '}
                <span className="muted">
                  ({overall.score.toFixed(2)} / {SCORE_LEVELS.length - 1})
                </span>
              </motion.div>
            )}
            {spent.calls > 0 && (
              <p className="muted small">
                {spent.calls} Jev calls · {formatUsd(spent.cost)} · avg{' '}
                {Math.round(spent.latency / spent.calls)} ms
              </p>
            )}
          </div>

          <ul className="flag-list">
            <AnimatePresence initial={false}>
              {flags.map((c) => {
                const v = verdicts[c.id]
                return (
                  <motion.li
                    key={c.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`tag-${severity(v.p)}`}
                  >
                    <button
                      onClick={() =>
                        clauseEls.current
                          .get(c.id)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                    >
                      <b>{v.kind === 'ordinary' ? 'Worth a look' : FLAG_KINDS[v.kind].label}</b>
                      <span>{c.text.slice(0, 90)}…</span>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>

          <div className="ask">
            <h3>Ask the whole document</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void ask(question)
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Can they…?"
                aria-label="Question about the whole document"
                maxLength={300}
              />
              <button className="primary-btn" disabled={asking || !question.trim()}>
                Ask
              </button>
            </form>
            <div className="chips">
              {ASK_EXAMPLES.map((q) => (
                <button key={q} className="chip" onClick={() => void ask(q)} disabled={asking}>
                  {q}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {answer && (
                <motion.div
                  key={answer.q}
                  className={answer.p >= 0.5 ? 'answer yes' : 'answer no'}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="answer-q">{answer.q}</span>
                  <b>
                    {answer.p >= 0.5 ? 'Yes' : 'No'} · {formatPct(answer.p)} likely
                  </b>
                  <CallStat latencyMs={answer.latencyMs} cost={answer.cost} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </section>
  )
}
