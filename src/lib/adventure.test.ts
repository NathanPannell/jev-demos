import { describe, expect, it } from 'vitest'
import {
  allowedMoves,
  applyMove,
  confusedLine,
  describeRoom,
  newGame,
  shouldAct,
  type GameState,
} from './adventure'

const ids = (s: GameState) => allowedMoves(s).map((m) => m.id)

function play(...moves: string[]): GameState {
  return moves.reduce((s, m) => applyMove(s, m).state, newGame())
}

describe('adventure', () => {
  it('can be won by the intended route', () => {
    const s = play(
      'take_lantern',
      'go_north',
      'take_cheese',
      'climb_tree',
      'go_east',
      'give_cheese',
      'go_east',
      'light_lantern',
      'open_chest',
    )
    expect(s.won).toBe(true)
    expect(s.room).toBe('cave')
    expect(ids(s)).toEqual(['restart'])
    expect(applyMove(s, 'restart').state).toEqual(newGame())
  })

  it('always offers look, inventory and unclear', () => {
    for (const s of [newGame(), play('go_north'), play('go_north', 'go_east')]) {
      expect(ids(s)).toEqual(expect.arrayContaining(['look', 'inventory', 'unclear']))
    }
  })

  it('only offers moves that make sense', () => {
    expect(ids(newGame())).toContain('take_lantern')
    expect(ids(play('take_lantern'))).not.toContain('take_lantern')
    expect(ids(play('go_north', 'go_east'))).not.toContain('give_cheese')
    expect(ids(play('go_north', 'take_cheese', 'go_east'))).toContain('give_cheese')
    expect(ids(play('go_north', 'go_east'))).not.toContain('go_east')
  })

  it('treats moves that are not allowed here as unclear', () => {
    const s = newGame()
    const r = applyMove(s, 'open_chest')
    expect(r.state).toBe(s)
    expect(r.text).toBe(confusedLine(s))
  })

  it('handles the troll, darkness and the locked chest', () => {
    const atBridge = play('go_north', 'go_east')
    expect(applyMove(atBridge, 'fight_troll').state.room).toBe('forest')
    expect(applyMove(atBridge, 'talk_troll').text).toMatch(/CHEESE/)
    expect(applyMove(atBridge, 'sneak_past').state.room).toBe('bridge')
    expect(describeRoom(atBridge)).toMatch(/troll blocks/)

    const inCave = play(
      'take_lantern',
      'go_north',
      'take_cheese',
      'go_east',
      'give_cheese',
      'go_east',
    )
    expect(describeRoom(inCave)).toMatch(/pitch dark/)
    expect(ids(inCave)).not.toContain('open_chest')
    const lit = applyMove(inCave, 'light_lantern').state
    expect(describeRoom(lit)).toMatch(/iron chest/)
    expect(applyMove(lit, 'open_chest').text).toMatch(/locked/)
    expect(applyMove(lit, 'go_west').state.room).toBe('bridge')
    expect(describeRoom(play('go_north', 'take_cheese', 'go_east', 'give_cheese'))).toMatch(
      /snoring/,
    )
  })

  it('describes inventory and small actions', () => {
    expect(applyMove(newGame(), 'inventory').text).toMatch(/lint/)
    expect(applyMove(play('take_lantern'), 'inventory').text).toMatch(/a lantern/)
    expect(applyMove(newGame(), 'look').text).toMatch(/brass lantern/)
    expect(applyMove(newGame(), 'sleep').state.turns).toBe(1)
    expect(applyMove(play('go_north'), 'go_south').state.room).toBe('cottage')
    expect(describeRoom(play('take_lantern'))).toMatch(/table is bare/)
    for (const room of ['cottage', 'forest', 'bridge', 'cave'] as const) {
      expect(confusedLine({ ...newGame(), room })).toBeTruthy()
    }
  })

  it('acts only on confident, clear decisions', () => {
    expect(shouldAct('go_north', 0.9)).toBe(true)
    expect(shouldAct('go_north', 0.2)).toBe(false)
    expect(shouldAct('unclear', 0.99)).toBe(false)
  })
})
