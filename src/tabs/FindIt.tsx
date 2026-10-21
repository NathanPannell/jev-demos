import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Stage } from '../components/Stage'
import { CallStat, ErrorNote, Hook } from '../components/ui'
import { PROVERBS, SAMPLE_IMAGES, TARGETS } from '../data/find'
import { askJev, noul, type Box, type BoxAnswer } from '../lib/jev'
import { toJevImage } from '../lib/image'
import { formatPct } from '../lib/format'
import { blip } from '../lib/sound'

type Mode = 'puzzle' | 'anything'

interface Found {
  box: Box
  confidence: number
  present: number | null
  latencyMs: number
  cost: number
}

const imageCache = new Map<string, Promise<{ dataUrl: string; url: string }>>()
function loadSample(src: string) {
  if (!imageCache.has(src)) imageCache.set(src, toJevImage(src))
  return imageCache.get(src)!
}

export default function FindIt() {
  const [mode, setMode] = useState<Mode>('puzzle')
  return (
    <section className="find">
      <Hook title="Ask Jev where something is. It draws the box.">
        New in Jev 1.14: <code>box</code> answers. Pick a proverb hidden in Bruegel's painting, or
        drop in any picture and type what to find.
      </Hook>
      <div className="segmented" role="tablist" aria-label="Find mode">
        {(['puzzle', 'anything'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'seg on' : 'seg'}
            onClick={() => {
              blip('tick')
              setMode(m)
            }}
          >
            {mode === m && <motion.span layoutId="seg-pill" className="seg-pill" />}
            <span>{m === 'puzzle' ? 'Find the proverb' : 'Find anything'}</span>
          </button>
        ))}
      </div>
      {mode === 'puzzle' ? <Puzzle /> : <Anything />}
    </section>
  )
}

function Puzzle() {
  const [target, setTarget] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zoomTimer = useRef<number>(0)

  async function find(id: string) {
    const t = TARGETS.find((x) => x.id === id)!
    window.clearTimeout(zoomTimer.current)
    setTarget(id)
    setFound(null)
    setZoomed(false)
    setError(null)
    setBusy(true)
    blip('whoosh')
    try {
      const { dataUrl } = await loadSample(PROVERBS.src)
      const r = await askJev('find', {
        image: dataUrl,
        questions: { where: { type: 'box', instructions: t.prompt } },
      })
      const a = r.answers.where as BoxAnswer
      setFound({
        box: a.box,
        confidence: a.confidence,
        present: null,
        latencyMs: r.latencyMs,
        cost: r.usage.cost,
      })
      blip('hit')
      zoomTimer.current = window.setTimeout(() => setZoomed(true), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const t = TARGETS.find((x) => x.id === target)

  return (
    <div className="find-layout">
      <div className="find-main">
        <Stage
          src={PROVERBS.src}
          alt="Netherlandish Proverbs by Pieter Bruegel the Elder: a crowded village full of people acting out proverbs"
          box={found?.box ?? null}
          label={t && found ? `${t.proverb} · ${formatPct(found.confidence)} sure` : undefined}
          zoomed={zoomed}
          scanning={busy}
        >
          <AnimatePresence>
            {zoomed && (
              <motion.button
                className="zoom-out"
                onClick={() => setZoomed(false)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                Zoom out
              </motion.button>
            )}
          </AnimatePresence>
        </Stage>
        <p className="credit">
          {PROVERBS.credit}{' '}
          <a href={PROVERBS.sourceUrl} target="_blank" rel="noreferrer">
            Source
          </a>
        </p>
      </div>
      <aside className="find-side">
        <h3>Find…</h3>
        <div className="targets">
          {TARGETS.map((x) => (
            <motion.button
              key={x.id}
              className={x.id === target ? 'target on' : 'target'}
              onClick={() => void find(x.id)}
              disabled={busy}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="target-proverb">{x.proverb}</span>
              <span className="target-prompt">“{x.prompt}”</span>
            </motion.button>
          ))}
        </div>
        {found && <CallStat latencyMs={found.latencyMs} cost={found.cost} />}
        <ErrorNote message={error} />
      </aside>
    </div>
  )
}

function Anything() {
  const [image, setImage] = useState<{ dataUrl: string; url: string } | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function pickImage(source: File | string) {
    setError(null)
    setFound(null)
    setZoomed(false)
    try {
      if (source instanceof File && !/^image\/(png|jpe?g|webp|gif)$/.test(source.type)) {
        throw new Error('Please choose a PNG, JPEG, WebP or GIF image.')
      }
      if (source instanceof File && source.size > 20_000_000) {
        throw new Error('That image is over 20 MB.')
      }
      setImage(await (typeof source === 'string' ? loadSample(source) : toJevImage(source)))
      blip('pop')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image')
    }
  }

  async function find() {
    if (!image || !query.trim()) return
    setBusy(true)
    setError(null)
    setFound(null)
    setZoomed(false)
    blip('whoosh')
    try {
      const q = query.trim()
      const r = await askJev('find', {
        image: image.dataUrl,
        questions: {
          where: { type: 'box', instructions: q },
          present: { type: 'noul', instructions: `Is there ${q} in this image?` },
        },
      })
      const a = r.answers.where as BoxAnswer
      const present = noul(r, 'present')
      setFound({
        box: a.box,
        confidence: a.confidence,
        present,
        latencyMs: r.latencyMs,
        cost: r.usage.cost,
      })
      blip(present >= 0.35 ? 'hit' : 'error')
      if (present >= 0.35) window.setTimeout(() => setZoomed(true), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const absent = found?.present !== null && found !== null && found.present < 0.35

  return (
    <div className="find-layout">
      <div className="find-main">
        {image ? (
          <Stage
            src={image.url}
            alt="Your image"
            box={found?.box ?? null}
            label={
              found
                ? absent
                  ? `Probably not here (${formatPct(found.present ?? 0)}) · best guess`
                  : `${query} · ${formatPct(found.confidence)} sure`
                : undefined
            }
            dashed={absent}
            tone={absent ? 'hot' : 'accent'}
            zoomed={zoomed}
            scanning={busy}
            onDropFile={(f) => void pickImage(f)}
          >
            {zoomed && (
              <button className="zoom-out" onClick={() => setZoomed(false)}>
                Zoom out
              </button>
            )}
          </Stage>
        ) : (
          <button
            className="dropzone"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) void pickImage(f)
            }}
          >
            <span className="dropzone-icon" aria-hidden>
              🖼️
            </span>
            <b>Drop an image here or click to upload</b>
            <span>Got a Where's Waldo page? Drop it in and ask Jev to find Waldo.</span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickImage(f)
            e.target.value = ''
          }}
        />
      </div>
      <aside className="find-side">
        <h3>1. Pick an image</h3>
        <div className="chips">
          {SAMPLE_IMAGES.map((s) => (
            <button key={s.id} className="chip" onClick={() => void pickImage(s.src)}>
              {s.label}
            </button>
          ))}
          <button className="chip" onClick={() => fileInput.current?.click()}>
            Upload your own…
          </button>
        </div>
        <h3>2. Say what to find</h3>
        <form
          className="find-form"
          onSubmit={(e) => {
            e.preventDefault()
            void find()
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. a child walking on stilts"
            aria-label="What to find"
            maxLength={200}
          />
          <button className="primary-btn" disabled={!image || !query.trim() || busy}>
            Find it
          </button>
        </form>
        <p className="hint">
          Jev answers with one box plus a yes/no on whether the thing is there at all.
        </p>
        {found && <CallStat latencyMs={found.latencyMs} cost={found.cost} />}
        <ErrorNote message={error} />
      </aside>
    </div>
  )
}
