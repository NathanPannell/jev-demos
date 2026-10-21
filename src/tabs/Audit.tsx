import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Stage } from '../components/Stage'
import { CallStat, ErrorNote, Hook, ProbBar } from '../components/ui'
import { AUDIT_SAMPLES, DESIGN_RULES } from '../data/audit'
import { areaQuestion, brokenRules, ruleQuestion } from '../lib/audit'
import { askJev, noul, type Box, type BoxAnswer } from '../lib/jev'
import { toJevImage } from '../lib/image'
import { formatPct } from '../lib/format'
import { blip } from '../lib/sound'

interface Shot {
  id: string
  title: string
  url: string
  dataUrl: string
  planted: number | null
  plantedArea: string | null
}

interface Result {
  probs: Record<number, number>
  broken: number[]
  box: Box | null
  boxConfidence: number
  latencyMs: number
  cost: number
}

export default function Audit() {
  const [shot, setShot] = useState<Shot | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [phase, setPhase] = useState<'idle' | 'rules' | 'box' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const runId = useRef(0)

  async function audit(next: Shot) {
    const id = ++runId.current
    setShot(next)
    setResult(null)
    setError(null)
    setPhase('rules')
    blip('whoosh')
    try {
      const r1 = await askJev('audit', {
        state: 'A screenshot of an app screen.',
        image: next.dataUrl,
        questions: Object.fromEntries(
          DESIGN_RULES.map((rule) => [
            `r${rule.id}`,
            { type: 'noul', instructions: ruleQuestion(rule) },
          ]),
        ),
      })
      if (id !== runId.current) return
      const probs = Object.fromEntries(DESIGN_RULES.map((r) => [r.id, noul(r1, `r${r.id}`)]))
      const broken = brokenRules(probs)
      setResult({
        probs,
        broken,
        box: null,
        boxConfidence: 0,
        latencyMs: r1.latencyMs,
        cost: r1.usage.cost,
      })
      if (broken.length === 0) {
        setPhase('done')
        blip('win')
        return
      }
      blip('error')
      setPhase('box')
      const rule = DESIGN_RULES.find((r) => r.id === broken[0])!
      const r2 = await askJev('audit', {
        image: next.dataUrl,
        questions: { area: { type: 'box', instructions: areaQuestion(rule) } },
      })
      if (id !== runId.current) return
      const a = r2.answers.area as BoxAnswer
      setResult({
        probs,
        broken,
        box: a.box,
        boxConfidence: a.confidence,
        latencyMs: r1.latencyMs + r2.latencyMs,
        cost: r1.usage.cost + r2.usage.cost,
      })
      setPhase('done')
      blip('hit')
    } catch (err) {
      if (id !== runId.current) return
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('idle')
    }
  }

  async function pickSample(id: string) {
    const s = AUDIT_SAMPLES.find((x) => x.id === id)!
    try {
      const img = await toJevImage(s.src)
      void audit({ ...s, url: s.src, dataUrl: img.dataUrl })
    } catch {
      setError('Could not load that sample')
    }
  }

  async function upload(file: File) {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError('Please choose a PNG, JPEG or WebP screenshot.')
      return
    }
    try {
      const img = await toJevImage(file)
      void audit({
        id: 'upload',
        title: file.name,
        url: img.url,
        dataUrl: img.dataUrl,
        planted: null,
        plantedArea: null,
      })
    } catch {
      setError('Could not read that image')
    }
  }

  const topRule = result?.broken[0] ? DESIGN_RULES.find((r) => r.id === result.broken[0]) : null
  const busy = phase === 'rules' || phase === 'box'

  return (
    <section className="audit">
      <Hook title="Hold every screen to your design standard.">
        Jev checks a screenshot against 8 written rules (one <code>noul</code> each), then draws a{' '}
        <code>box</code> around whatever breaks the worst one.
      </Hook>

      <div className="shots" aria-label="Sample screenshots">
        {AUDIT_SAMPLES.map((s) => (
          <motion.button
            key={s.id}
            className={shot?.id === s.id ? 'shot on' : 'shot'}
            onClick={() => void pickSample(s.id)}
            disabled={busy}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.96 }}
          >
            <img src={s.src} alt="" loading="lazy" />
            <span>{s.title}</span>
          </motion.button>
        ))}
        <button
          className="shot shot-upload"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <span className="dropzone-icon" aria-hidden>
            ⬆️
          </span>
          <span>Upload a screenshot</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
      </div>
      <ErrorNote message={error} />

      <div className="audit-layout">
        <div className="audit-main">
          {shot ? (
            <Stage
              src={shot.url}
              alt={`Screenshot: ${shot.title}`}
              box={result?.box ?? null}
              label={
                topRule && result?.box
                  ? `Rule ${topRule.id}: ${topRule.title} · ${formatPct(result.boxConfidence)} sure`
                  : undefined
              }
              tone="hot"
              zoomed={false}
              scanning={busy}
            />
          ) : (
            <div className="placeholder-shot">
              <p>Pick a screenshot above. Four each break exactly one rule; one is clean.</p>
            </div>
          )}
          <AnimatePresence>
            {phase === 'done' && result && (
              <motion.div
                className={result.broken.length ? 'verdict bad' : 'verdict good'}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                {result.broken.length ? (
                  <>
                    <b>
                      ✗ Breaks rule{result.broken.length > 1 ? 's' : ''} {result.broken.join(', ')}
                    </b>
                    {topRule && <span> — {topRule.title}</span>}
                  </>
                ) : (
                  <b>✓ Passes all 8 rules</b>
                )}
                {shot && shot.id !== 'upload' && (
                  <span className="answer-key">
                    Answer key:{' '}
                    {shot.planted
                      ? `rule ${shot.planted} was planted (${shot.plantedArea}). ${
                          result.broken[0] === shot.planted ? 'Jev caught it.' : 'Jev missed it.'
                        }`
                      : `this screen is clean. ${result.broken.length ? 'Jev raised a false alarm.' : 'Jev agrees.'}`}
                  </span>
                )}
                <CallStat latencyMs={result.latencyMs} cost={result.cost} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="rules">
          <div className="rules-head">
            <h3>Pebble UI Standard v1</h3>
            <button className="ghost-btn small" onClick={() => setShowRules(!showRules)}>
              {showRules ? 'Hide rule text' : 'Show rule text'}
            </button>
          </div>
          <ol>
            {DESIGN_RULES.map((rule, i) => {
              const p = result?.probs[rule.id] ?? null
              const broken = result?.broken.includes(rule.id) ?? false
              return (
                <motion.li
                  key={rule.id}
                  className={broken ? 'rule broken' : p !== null ? 'rule ok' : 'rule'}
                  initial={false}
                  animate={broken ? { x: [0, -5, 5, 0] } : { x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="rule-row">
                    <span className="rule-mark" aria-hidden>
                      {p === null ? rule.id : broken ? '✗' : '✓'}
                    </span>
                    <span className="rule-title">{rule.title}</span>
                  </div>
                  {showRules && <p className="rule-text">{rule.rule}</p>}
                  <ProbBar
                    p={phase === 'rules' ? null : p}
                    tone={broken ? 'hot' : 'muted'}
                    label={`Chance rule ${rule.id} is broken`}
                  />
                </motion.li>
              )
            })}
          </ol>
          <p className="hint">Bars show Jev's probability that each rule is broken.</p>
        </aside>
      </div>
    </section>
  )
}
