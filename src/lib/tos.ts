export interface Clause {
  id: number
  text: string
  /** Headings are shown but not sent to Jev. */
  heading: boolean
}

const MAX_CLAUSES = 150

/** Splits a terms-of-service document into paragraphs, marking short title lines as headings. */
export function splitClauses(doc: string): Clause[] {
  const paragraphs = doc
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .flatMap((p) => {
      // Single newlines inside a paragraph: keep heading-like first lines separate.
      const lines = p.split('\n').map((l) => l.trim())
      const out: string[] = []
      const buf: string[] = []
      for (const line of lines) {
        if (!line) continue
        if (isHeading(line) && buf.length === 0) out.push(line)
        else buf.push(line)
      }
      if (buf.length) out.push(buf.join(' '))
      return out
    })
    .filter((p) => p.length > 0)
    .slice(0, MAX_CLAUSES)
  return paragraphs.map((text, id) => ({ id, text, heading: isHeading(text) }))
}

export function isHeading(text: string): boolean {
  const t = text.trim()
  if (t.length > 70) return false
  if (/^(\d+(\.\d+)*\.?|[IVX]+\.|section \d+)\s+\S/i.test(t)) return true
  if (/^last updated/i.test(t)) return true
  return !/[.:;?!)"]$/.test(t)
}

export type FlagKind =
  | 'auto_renewal'
  | 'fees'
  | 'content_license'
  | 'data_sharing'
  | 'changes'
  | 'termination'
  | 'liability'
  | 'disputes'
  | 'gag'
  | 'ordinary'

export const FLAG_KINDS: Record<FlagKind, { label: string; criterion: string }> = {
  auto_renewal: {
    label: 'Auto-renewal trap',
    criterion: 'Automatic renewal or a hard-to-cancel subscription',
  },
  fees: {
    label: 'Surprise fees',
    criterion: 'Non-refundable fees, cancellation fees or surprise charges',
  },
  content_license: {
    label: 'Grabs your content',
    criterion: "A broad licence over the user's content or ideas",
  },
  data_sharing: {
    label: 'Sells your data',
    criterion: 'Selling, sharing or keeping personal data',
  },
  changes: {
    label: 'Changes without notice',
    criterion: 'Changing the terms or the service without notice',
  },
  termination: {
    label: 'Kick you out anytime',
    criterion: 'Closing accounts or taking away access at will',
  },
  liability: {
    label: 'Dodges liability',
    criterion: "Limiting the company's liability or making the user indemnify it",
  },
  disputes: {
    label: 'No day in court',
    criterion: 'Arbitration, jury waiver or class-action waiver',
  },
  gag: { label: 'Gag clause', criterion: 'Restricting reviews or speech about the company' },
  ordinary: { label: 'Boilerplate', criterion: 'Ordinary, fair boilerplate' },
}

export const UNFAIR_QUESTION =
  'Is this terms-of-service clause unusually unfair to the user, or something a careful reader would want to be warned about?'

export type Severity = 'red' | 'yellow' | 'ok'

/** Jev's probability that a clause is unfair, bucketed for the highlighter. */
export function severity(p: number): Severity {
  if (p >= 0.75) return 'red'
  if (p >= 0.5) return 'yellow'
  return 'ok'
}
