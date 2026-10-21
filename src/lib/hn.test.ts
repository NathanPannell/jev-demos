import { describe, expect, it, vi } from 'vitest'
import { cleanCommentHtml, fetchComments, parseHits } from './hn'

describe('cleanCommentHtml', () => {
  it('strips tags and decodes entities', () => {
    expect(
      cleanCommentHtml(
        'I&#x27;d say <i>no</i>.<p>&gt; quote &amp; &quot;more&quot;&#33; &nbsp;<a href="x">link</a>',
      ),
    ).toBe('I\'d say no.\n\n> quote & "more"!  link')
    expect(cleanCommentHtml('a<br>b &bogus; c')).toBe('a\nb &bogus; c')
  })
})

describe('parseHits', () => {
  it('keeps comments with text and fills defaults', () => {
    const out = parseHits([
      {
        objectID: '1',
        author: 'pg',
        comment_text: 'Hello',
        story_title: 'Show HN',
        created_at_i: 5,
      },
      { objectID: '2', comment_text: '   ' },
      { objectID: '3', comment_text: '<p></p>' },
      { objectID: '4', comment_text: 'x' },
    ])
    expect(out).toEqual([
      { id: '1', author: 'pg', text: 'Hello', storyTitle: 'Show HN', createdAt: 5 },
      { id: '4', author: 'anon', text: 'x', storyTitle: '', createdAt: 0 },
    ])
  })
})

describe('fetchComments', () => {
  it('builds the Algolia query', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ hits: [{ objectID: '1', comment_text: 'hi' }] }),
    )
    const out = await fetchComments({
      page: 2,
      after: 100,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const url = (fetchImpl.mock.calls[0] as unknown as [string])[0]
    expect(url).toContain('tags=comment')
    expect(url).toContain('page=2')
    expect(url).toContain('numericFilters=created_at_i%3E100')
    expect(out).toHaveLength(1)
  })

  it('throws on HTTP errors and tolerates missing hits', async () => {
    const bad = (async () => new Response('', { status: 500 })) as typeof fetch
    await expect(fetchComments({ fetchImpl: bad })).rejects.toThrow(/500/)
    const empty = (async () => Response.json({})) as typeof fetch
    expect(await fetchComments({ fetchImpl: empty })).toEqual([])
  })
})
