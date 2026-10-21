export interface DesignRule {
  id: number
  title: string
  /** The precise rule Jev checks. */
  rule: string
}

/** "Pebble UI Standard v1": the short design standard the audit tab checks against. */
export const DESIGN_RULES: DesignRule[] = [
  {
    id: 1,
    title: 'Readable contrast',
    rule: 'All text has a contrast ratio of at least 4.5:1 against its background. No pale grey text on a light background.',
  },
  {
    id: 2,
    title: 'Big tap targets',
    rule: 'Every button, link and icon control is at least 44 by 44 pixels.',
  },
  {
    id: 3,
    title: 'One primary action',
    rule: 'Each view has exactly one primary button (a solid, filled, brand-coloured button). Other actions use outline or text buttons.',
  },
  {
    id: 4,
    title: 'Two typefaces max',
    rule: 'The view uses at most two font families. No decorative, script, comic or mixed typefaces.',
  },
  {
    id: 5,
    title: 'Left-aligned body text',
    rule: 'Paragraphs of body text are left-aligned. Only short headings may be centred.',
  },
  {
    id: 6,
    title: 'Visible field labels',
    rule: 'Every form field has a visible text label outside the field. Placeholder text alone is not a label.',
  },
  {
    id: 7,
    title: 'No shouting',
    rule: 'Sentences and paragraphs are never set in ALL CAPS. Only short labels of one or two words may be uppercase.',
  },
  {
    id: 8,
    title: 'Consistent spacing',
    rule: 'Elements are spaced on an 8 pixel grid with even, consistent gaps. Nothing overlaps or touches the edge.',
  },
]

export interface AuditSample {
  id: string
  title: string
  src: string
  /** The rule planted in this screenshot, or null for the clean one. Shown only after Jev answers. */
  planted: number | null
  plantedArea: string | null
}

export const AUDIT_SAMPLES: AuditSample[] = [
  {
    id: 'contrast',
    title: 'Plant care dashboard',
    src: '/samples/audit/contrast.png',
    planted: 1,
    plantedArea: 'the pale grey intro paragraph',
  },
  {
    id: 'primaries',
    title: 'Checkout',
    src: '/samples/audit/primaries.png',
    planted: 3,
    plantedArea: 'two solid green buttons side by side',
  },
  {
    id: 'fonts',
    title: 'Newsletter',
    src: '/samples/audit/fonts.png',
    planted: 4,
    plantedArea: 'the headline and intro in four different typefaces',
  },
  {
    id: 'labels',
    title: 'Sign up',
    src: '/samples/audit/labels.png',
    planted: 6,
    plantedArea: 'the form fields with placeholder-only labels',
  },
  {
    id: 'clean',
    title: 'Clean reference',
    src: '/samples/audit/clean.png',
    planted: null,
    plantedArea: null,
  },
]
