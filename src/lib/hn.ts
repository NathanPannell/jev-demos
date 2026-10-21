// Live Hacker News comments from the free, keyless Algolia HN Search API.

export interface HnComment {
  id: string
  author: string
  text: string
  storyTitle: string
  createdAt: number
}

/** The filter, chosen empirically: it matched 30.5% of a 200-comment live sample (see README). */
export const HOT_TAKE_QUESTION =
  'Does the comment contain a spicy hot take that many readers would push back on?'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function cleanCommentHtml(html: string): string {
  return html
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface AlgoliaHit {
  objectID: string
  author?: string
  comment_text?: string
  story_title?: string
  created_at_i?: number
}

export function parseHits(hits: AlgoliaHit[]): HnComment[] {
  return hits
    .filter((h) => h.comment_text && h.comment_text.trim())
    .map((h) => ({
      id: h.objectID,
      author: h.author ?? 'anon',
      text: cleanCommentHtml(h.comment_text ?? '').slice(0, 2_000),
      storyTitle: h.story_title ?? '',
      createdAt: h.created_at_i ?? 0,
    }))
    .filter((c) => c.text.length > 0)
}

const BASE = 'https://hn.algolia.com/api/v1/search_by_date'

/** Newest comments first. `page` pages back in time; `after` limits to comments newer than a timestamp. */
export async function fetchComments(
  opts: { page?: number; after?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<HnComment[]> {
  const params = new URLSearchParams({ tags: 'comment', hitsPerPage: '60' })
  if (opts.page) params.set('page', String(opts.page))
  if (opts.after) params.set('numericFilters', `created_at_i>${opts.after}`)
  const res = await (opts.fetchImpl ?? fetch)(`${BASE}?${params}`, { signal: opts.signal })
  if (!res.ok) throw new Error(`HN search failed (${res.status})`)
  const data = (await res.json()) as { hits?: AlgoliaHit[] }
  return parseHits(data.hits ?? [])
}
