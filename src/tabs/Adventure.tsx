import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CallStat, ErrorNote, Hook } from '../components/ui'
import {
  allowedMoves,
  applyMove,
  confusedLine,
  describeRoom,
  newGame,
  ROOM_NAMES,
  shouldAct,
  type GameState,
  type Item,
} from '../lib/adventure'
import { askJev, type ChoiceAnswer } from '../lib/jev'
import { formatPct } from '../lib/format'
import { blip } from '../lib/sound'

type Entry =
  | { kind: 'narration'; id: number; text: string; win?: boolean }
  | { kind: 'player'; id: number; text: string }
  | {
      kind: 'decision'
      id: number
      move: string
      confidence: number
      acted: boolean
      latencyMs: number
      cost: number
    }

const ICONS: Record<Item, string> = { lantern: '🏮', cheese: '🧀', key: '🗝️' }

const SUGGESTIONS: Record<GameState['room'], string[]> = {
  cottage: ['grab that lamp', 'prends la lanterne', 'head outside', 'five more minutes…'],
  forest: ['nimm den Käse', 'climb up to the shiny thing', '東へ行く', 'go back home'],
  bridge: ['toss the troll my cheddar', 'hola señor troll', 'punch him', 'tiptoe past'],
  cave: ['light it up', 'abre el cofre', 'what am I carrying?', 'leave'],
}

let nextId = 1

export default function Adventure() {
  const [game, setGame] = useState<GameState>(newGame)
  const [log, setLog] = useState<Entry[]>(() => [
    { kind: 'narration', id: nextId++, text: describeRoom(newGame()) },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [lastMove, setLastMove] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [log])

  const moves = allowedMoves(game)

  async function send(text: string) {
    const command = text.trim()
    if (!command || busy) return
    if (game.won) {
      setInput('')
      restart()
      return
    }
    setInput('')
    setError(null)
    setBusy(true)
    setLastMove(null)
    setLog((l) => [...l, { kind: 'player', id: nextId++, text: command }])
    try {
      const r = await askJev('adventure', {
        state: { scene: describeRoom(game), player_command: command },
        questions: {
          move: {
            type: 'choice',
            instructions:
              "This is a text adventure. Which game move does the player's command (player_command) ask for? The command may be in any language.",
            criteria: Object.fromEntries(moves.map((m) => [m.id, m.description])),
          },
        },
      })
      const a = r.answers.move as ChoiceAnswer
      const acted = shouldAct(a.choice, a.confidence)
      const decision: Entry = {
        kind: 'decision',
        id: nextId++,
        move: a.choice,
        confidence: a.confidence,
        acted,
        latencyMs: r.latencyMs,
        cost: r.usage.cost,
      }
      setLastMove(a.choice)
      if (acted) {
        const result = applyMove(game, a.choice)
        setGame(result.state)
        setLog((l) => [
          ...l,
          decision,
          { kind: 'narration', id: nextId++, text: result.text, win: result.state.won },
        ])
        blip(result.state.won ? 'win' : 'pop')
      } else {
        setShake((s) => s + 1)
        blip('error')
        setLog((l) => [
          ...l,
          decision,
          {
            kind: 'narration',
            id: nextId++,
            text: `${confusedLine(game)} (Jev couldn't map that to a move here. Try one of the hints.)`,
          },
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    const g = newGame()
    setGame(g)
    setLastMove(null)
    setLog([{ kind: 'narration', id: nextId++, text: describeRoom(g) }])
    blip('whoosh')
  }

  return (
    <section className="adventure">
      <Hook title="Type anything, in any language. Jev picks the move.">
        No parser, no keyword list: Jev picks one <code>choice</code> from the moves allowed in this
        room, with a confidence. Low confidence? The game admits it didn't understand.
      </Hook>

      <div className="adv-frame">
        <div className="adv-head">
          <AnimatePresence mode="wait">
            <motion.h3
              key={game.room}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              {ROOM_NAMES[game.room]}
            </motion.h3>
          </AnimatePresence>
          <div className="inventory" aria-label="Inventory">
            <AnimatePresence>
              {game.inventory.map((i) => (
                <motion.span
                  key={i}
                  title={i}
                  initial={{ scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                >
                  {ICONS[i]}
                </motion.span>
              ))}
            </AnimatePresence>
            {game.inventory.length === 0 && <span className="muted">empty pockets</span>}
          </div>
          <button className="ghost-btn small" onClick={restart} disabled={busy}>
            Restart
          </button>
        </div>

        <div className="adv-log" ref={logRef} aria-live="polite">
          <AnimatePresence initial={false}>
            {log.map((e) => (
              <motion.div
                key={e.id}
                className={`adv-entry adv-${e.kind}${e.kind === 'narration' && e.win ? ' adv-win' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {e.kind === 'player' && <>&gt; {e.text}</>}
                {e.kind === 'narration' && e.text}
                {e.kind === 'decision' && (
                  <span className={e.acted ? 'decision' : 'decision unsure'}>
                    {e.acted ? '⚡' : '🤔'} <code>{e.move}</code> · {formatPct(e.confidence)} sure
                    <CallStat latencyMs={e.latencyMs} cost={e.cost} />
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && <div className="adv-entry adv-thinking">Jev is deciding…</div>}
        </div>

        <motion.form
          className="adv-input"
          key={shake}
          animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
          transition={{ duration: 0.35 }}
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <span className="prompt" aria-hidden>
            &gt;
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you do? (any language)"
            aria-label="Your command"
            maxLength={300}
            disabled={busy}
          />
          <button className="primary-btn" disabled={busy || !input.trim()}>
            Go
          </button>
        </motion.form>
        <ErrorNote message={error} />

        <div className="adv-help">
          <div className="chips" aria-label="Try saying">
            {SUGGESTIONS[game.room].map((s) => (
              <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
          <div className="moves" aria-label="Moves Jev can choose from here">
            <span className="muted">Jev picks one of:</span>
            {moves.map((m) => (
              <motion.code key={m.id} className={m.id === lastMove ? 'move on' : 'move'} layout>
                {m.id}
              </motion.code>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
