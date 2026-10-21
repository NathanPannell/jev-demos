// Validates what the browser may ask Jev. The site is public and spends a real key, so every
// field is size-capped and only the four Jev question types are allowed.

export const QUESTION_TYPES = ['noul', 'choice', 'score', 'box'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const LIMITS = {
  bodyBytes: 4_000_000,
  imageBytes: 3_500_000,
  stateChars: 120_000,
  stateFields: 8,
  questions: 16,
  questionKeyChars: 40,
  instructionChars: 1_200,
  choiceOptions: 24,
  optionKeyChars: 60,
  optionDescChars: 600,
  scoreLevels: 10,
  scoreLevelChars: 200,
} as const

export interface Question {
  type: QuestionType
  instructions: string
  criteria?: Record<string, string> | string[]
}

export interface JevRequest {
  state?: string | Record<string, string>
  /** A data URL (PNG or JPEG). Becomes an image_url entry in Jev's state. */
  image?: string
  questions: Record<string, Question>
}

export class ValidationError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const KEY_RE = /^[A-Za-z0-9_]+$/
const IMAGE_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/

function fail(message: string): never {
  throw new ValidationError(message)
}

function checkString(v: unknown, max: number, what: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(`${what} must be a non-empty string`)
  if (v.length > max) fail(`${what} is longer than ${max} characters`)
  return v
}

function checkKey(k: string, max: number, what: string): void {
  if (k.length === 0 || k.length > max || !KEY_RE.test(k)) fail(`${what} "${k}" is not a valid key`)
}

function parseQuestion(key: string, raw: unknown, hasImage: boolean): Question {
  checkKey(key, LIMITS.questionKeyChars, 'question')
  if (!isRecord(raw)) fail(`question ${key} must be an object`)
  const type = raw.type
  if (typeof type !== 'string' || !(QUESTION_TYPES as readonly string[]).includes(type)) {
    fail(`question ${key} has an unsupported type`)
  }
  const instructions = checkString(
    raw.instructions,
    LIMITS.instructionChars,
    `question ${key} instructions`,
  )
  const q: Question = { type: type as QuestionType, instructions }

  if (type === 'choice') {
    const criteria = raw.criteria
    if (!isRecord(criteria)) fail(`choice question ${key} needs criteria`)
    const entries = Object.entries(criteria)
    if (entries.length < 2 || entries.length > LIMITS.choiceOptions) {
      fail(`choice question ${key} needs 2 to ${LIMITS.choiceOptions} options`)
    }
    q.criteria = {}
    for (const [opt, desc] of entries) {
      checkKey(opt, LIMITS.optionKeyChars, 'option')
      q.criteria[opt] = checkString(desc, LIMITS.optionDescChars, `option ${opt}`)
    }
  } else if (type === 'score') {
    const criteria = raw.criteria
    if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > LIMITS.scoreLevels) {
      fail(`score question ${key} needs 2 to ${LIMITS.scoreLevels} levels`)
    }
    q.criteria = criteria.map((l, i) => checkString(l, LIMITS.scoreLevelChars, `level ${i}`))
  } else if (raw.criteria !== undefined) {
    fail(`${type} question ${key} takes no criteria`)
  }

  if (type === 'box' && !hasImage) fail(`box question ${key} needs an image`)
  return q
}

function parseState(raw: unknown): JevRequest['state'] {
  if (raw === undefined) return undefined
  if (typeof raw === 'string') {
    if (raw.length > LIMITS.stateChars) fail(`state is longer than ${LIMITS.stateChars} characters`)
    return raw
  }
  if (!isRecord(raw)) fail('state must be a string or an object of strings')
  const entries = Object.entries(raw)
  if (entries.length === 0 || entries.length > LIMITS.stateFields) {
    fail(`state needs 1 to ${LIMITS.stateFields} fields`)
  }
  let total = 0
  const out: Record<string, string> = {}
  for (const [k, v] of entries) {
    checkKey(k, LIMITS.questionKeyChars, 'state field')
    if (typeof v !== 'string') fail(`state field ${k} must be a string`)
    total += v.length
    out[k] = v
  }
  if (total > LIMITS.stateChars) fail(`state is longer than ${LIMITS.stateChars} characters`)
  return out
}

export function parseJevRequest(body: unknown): JevRequest {
  if (!isRecord(body)) fail('body must be a JSON object')

  let image: string | undefined
  if (body.image !== undefined) {
    if (typeof body.image !== 'string' || !IMAGE_RE.test(body.image)) {
      fail('image must be a base64 PNG or JPEG data URL')
    }
    // base64 expands by 4/3; cap the decoded size.
    const decoded = Math.floor((body.image.length - body.image.indexOf(',') - 1) * 0.75)
    if (decoded > LIMITS.imageBytes) fail('image is too large')
    image = body.image
  }

  const state = parseState(body.state)
  if (state === undefined && image === undefined) fail('state or image is required')
  if (image !== undefined && state !== undefined && typeof state !== 'string') {
    fail('with an image, state must be a string')
  }

  if (!isRecord(body.questions)) fail('questions must be an object')
  const keys = Object.keys(body.questions)
  if (keys.length === 0 || keys.length > LIMITS.questions) {
    fail(`ask 1 to ${LIMITS.questions} questions`)
  }
  const questions: Record<string, Question> = {}
  for (const key of keys) {
    questions[key] = parseQuestion(key, body.questions[key], image !== undefined)
  }

  return { state, image, questions }
}

/** Jev on OpenRouter takes images as image_url entries inside a state array. */
export function toUpstreamState(req: JevRequest): unknown {
  if (req.image === undefined) return req.state
  const parts: unknown[] = []
  if (typeof req.state === 'string' && req.state.trim() !== '') parts.push(req.state)
  parts.push({ type: 'image_url', image_url: { url: req.image } })
  return parts
}

/** Rough size of the state in characters, used to decide when to opt in to long context. */
export function stateChars(req: JevRequest): number {
  if (req.state === undefined) return 0
  if (typeof req.state === 'string') return req.state.length
  return Object.values(req.state).reduce((n, v) => n + v.length, 0)
}
