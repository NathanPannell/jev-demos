// A tiny hand-written adventure. Jev maps free text to one of `allowedMoves()`; this module does the rest.

export type RoomId = 'cottage' | 'forest' | 'bridge' | 'cave'
export type Item = 'lantern' | 'cheese' | 'key'

export interface GameState {
  room: RoomId
  inventory: Item[]
  lanternLit: boolean
  cheeseOnStump: boolean
  keyInNest: boolean
  trollFed: boolean
  chestOpen: boolean
  won: boolean
  turns: number
}

export interface Move {
  id: string
  /** Description Jev sees as the choice criterion. */
  description: string
}

export const ROOM_NAMES: Record<RoomId, string> = {
  cottage: 'The Crooked Cottage',
  forest: 'The Whispering Forest',
  bridge: 'The Troll Bridge',
  cave: 'The Glittering Cave',
}

export function newGame(): GameState {
  return {
    room: 'cottage',
    inventory: [],
    lanternLit: false,
    cheeseOnStump: true,
    keyInNest: true,
    trollFed: false,
    chestOpen: false,
    won: false,
    turns: 0,
  }
}

const has = (s: GameState, item: Item) => s.inventory.includes(item)

export function describeRoom(s: GameState): string {
  switch (s.room) {
    case 'cottage':
      return [
        'You wake up in a crooked little cottage that smells of toast.',
        has(s, 'lantern') ? 'The table is bare.' : 'A brass lantern sits on the table.',
        'A door leads north into the forest.',
      ].join(' ')
    case 'forest':
      return [
        'Tall trees whisper rumours about you.',
        s.cheeseOnStump ? 'A suspiciously large wheel of cheese sits on a stump.' : '',
        s.keyInNest ? 'High in an oak tree, something glints inside a magpie nest.' : '',
        'The cottage is south. A rickety bridge lies to the east.',
      ]
        .filter(Boolean)
        .join(' ')
    case 'bridge':
      return s.trollFed
        ? 'The troll is curled up under the bridge, snoring happily and hugging the cheese rind. The way east to a cave is clear. The forest is west.'
        : 'A large troll blocks the bridge. "NOBODY CROSSES," it rumbles, "UNLESS I GET A SNACK." Its stomach growls like distant thunder. The forest is west.'
    case 'cave':
      return [
        s.lanternLit
          ? 'Your lantern lights up a cave full of glittering crystals.'
          : 'It is pitch dark. You hear dripping water and, possibly, your own regrets.',
        s.lanternLit && !s.chestOpen ? 'An iron chest sits in the corner, locked tight.' : '',
        s.chestOpen ? 'The chest stands open.' : '',
        'The bridge is back to the west.',
      ]
        .filter(Boolean)
        .join(' ')
  }
}

/** The moves Jev may choose from in the current state, always including look, inventory and unclear. */
export function allowedMoves(s: GameState): Move[] {
  const moves: Move[] = []
  const add = (id: string, description: string) => moves.push({ id, description })
  if (s.won) return [{ id: 'restart', description: 'Start a new game' }]

  switch (s.room) {
    case 'cottage':
      if (!has(s, 'lantern')) add('take_lantern', 'Pick up or grab the brass lantern')
      add('go_north', 'Leave the cottage, go outside, go north to the forest')
      add('sleep', 'Go back to bed, nap, rest')
      break
    case 'forest':
      if (s.cheeseOnStump) add('take_cheese', 'Pick up or take the wheel of cheese')
      if (s.keyInNest) add('climb_tree', 'Climb the oak tree, check the magpie nest, look up high')
      add('go_south', 'Go south, back to the cottage, go home')
      add('go_east', 'Go east towards the bridge')
      break
    case 'bridge':
      if (!s.trollFed) {
        if (has(s, 'cheese'))
          add('give_cheese', 'Give, offer, feed or throw the cheese to the troll')
        add('fight_troll', 'Attack, fight, punch or threaten the troll')
        add('talk_troll', 'Talk to, greet, ask or negotiate with the troll')
        add('sneak_past', 'Try to sneak, run or cross past the troll')
      } else {
        add('go_east', 'Cross the bridge, go east into the cave')
      }
      add('go_west', 'Go west, back to the forest')
      break
    case 'cave':
      if (has(s, 'lantern') && !s.lanternLit) add('light_lantern', 'Light or turn on the lantern')
      if (s.lanternLit && !s.chestOpen) add('open_chest', 'Open, unlock or search the iron chest')
      add('go_west', 'Leave the cave, go west back to the bridge')
      break
  }
  add('look', 'Look around, describe the room, where am I')
  add('inventory', 'Check what I am carrying, my bag, my items')
  add(
    'unclear',
    'The command does not match any of the other moves, is gibberish, or asks for something impossible here',
  )
  return moves
}

export interface MoveResult {
  state: GameState
  text: string
}

const nextTurn = (s: GameState, patch: Partial<GameState>): GameState => ({
  ...s,
  ...patch,
  turns: s.turns + 1,
})

/** Applies a move chosen by Jev. Moves not allowed in the current state are treated as `unclear`. */
export function applyMove(s: GameState, moveId: string): MoveResult {
  if (!allowedMoves(s).some((m) => m.id === moveId)) moveId = 'unclear'

  switch (moveId) {
    case 'restart':
      return { state: newGame(), text: describeRoom(newGame()) }
    case 'look':
      return { state: nextTurn(s, {}), text: describeRoom(s) }
    case 'inventory':
      return {
        state: nextTurn(s, {}),
        text: s.inventory.length
          ? `You are carrying: ${s.inventory.map((i) => (i === 'lantern' && s.lanternLit ? 'a lit lantern' : `a ${i}`)).join(', ')}.`
          : 'Your pockets contain lint and optimism.',
      }
    case 'take_lantern':
      return {
        state: nextTurn(s, { inventory: [...s.inventory, 'lantern'] }),
        text: 'You take the brass lantern. It feels important, in a foreshadowing sort of way.',
      }
    case 'sleep':
      return {
        state: nextTurn(s, {}),
        text: 'You nap for five minutes. Adventure waits, impatiently tapping its foot.',
      }
    case 'take_cheese':
      return {
        state: nextTurn(s, { inventory: [...s.inventory, 'cheese'], cheeseOnStump: false }),
        text: 'You heave the wheel of cheese under your arm. It is heavier than your life choices.',
      }
    case 'climb_tree':
      return {
        state: nextTurn(s, { inventory: [...s.inventory, 'key'], keyInNest: false }),
        text: 'You scramble up the oak. The magpie glares, but lets you swap a shiny button for a small iron key.',
      }
    case 'give_cheese':
      return {
        state: nextTurn(s, {
          trollFed: true,
          inventory: s.inventory.filter((i) => i !== 'cheese'),
        }),
        text: 'The troll gasps. "FOR ME?" It devours the cheese in three bites, sighs, and waves you across.',
      }
    case 'fight_troll':
      return {
        state: nextTurn(s, { room: 'forest' }),
        text: 'You raise your fists. The troll flicks you, gently, all the way back to the forest. Maybe try being nicer.',
      }
    case 'talk_troll':
      return {
        state: nextTurn(s, {}),
        text: '"I DO NOT DO RIDDLES," says the troll. "I DO SNACKS. SOMETHING CHEESY. YOU SEEN ANY CHEESE?"',
      }
    case 'sneak_past':
      return {
        state: nextTurn(s, {}),
        text: 'You tiptoe. The troll watches you tiptoe. It is very awkward for everyone. You stay where you are.',
      }
    case 'light_lantern':
      return {
        state: nextTurn(s, { lanternLit: true }),
        text: 'The lantern flares to life. Crystals blaze in every colour, and an iron chest appears in the corner.',
      }
    case 'open_chest':
      if (!has(s, 'key')) {
        return {
          state: nextTurn(s, {}),
          text: 'The chest is locked. Somewhere, a magpie is laughing at you.',
        }
      }
      return {
        state: nextTurn(s, { chestOpen: true, won: true }),
        text: 'The key turns with a satisfying clunk. Inside: the Golden Spoon of Destiny. You win! (Type anything to play again.)',
      }
    case 'go_north':
      return { state: move(s, 'forest'), text: describeRoom({ ...s, room: 'forest' }) }
    case 'go_south':
      return { state: move(s, 'cottage'), text: describeRoom({ ...s, room: 'cottage' }) }
    case 'go_east': {
      const to: RoomId = s.room === 'forest' ? 'bridge' : 'cave'
      return { state: move(s, to), text: describeRoom({ ...s, room: to }) }
    }
    case 'go_west': {
      const to: RoomId = s.room === 'cave' ? 'bridge' : 'forest'
      return { state: move(s, to), text: describeRoom({ ...s, room: to }) }
    }
    default:
      return { state: s, text: confusedLine(s) }
  }
}

function move(s: GameState, room: RoomId): GameState {
  return nextTurn(s, { room })
}

export function confusedLine(s: GameState): string {
  const lines: Record<RoomId, string> = {
    cottage: 'The cottage creaks politely, as if to say: "Pardon?"',
    forest: 'The trees whisper among themselves. They did not understand that either.',
    bridge: 'The troll squints at you. "WOT?"',
    cave: 'Your words echo back at you, sounding even less sensible.',
  }
  return lines[s.room]
}

/** Below this confidence the game says it didn't understand rather than act. */
export const CONFIDENCE_FLOOR = 0.45

export function shouldAct(moveId: string, confidence: number): boolean {
  return moveId !== 'unclear' && confidence >= CONFIDENCE_FLOOR
}
