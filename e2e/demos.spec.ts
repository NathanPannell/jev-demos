// Main user journeys against the built app. These make real Jev calls through /api/jev, so they
// assert on structure (a decision arrived and was rendered), not on exact model answers.
import { expect, test } from '@playwright/test'

test.describe('tabs', () => {
  test('every tab shows its hook and the URL tracks the tab', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /pocket change/ })).toBeVisible()
    const hooks: [string, RegExp, string][] = [
      ['Adventure', /picks the move/, '#adventure'],
      ['Find It', /draws the box/, '#find'],
      ['Design Audit', /design standard/, '#audit'],
      ['TOS Red Flags', /Jev reads every line/, '#tos'],
      ['HN Ticker', /pocket change/, '#hn'],
    ]
    for (const [tab, hook, hash] of hooks) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('heading', { name: hook })).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`${hash}$`))
    }
  })

  test('the page never scrolls sideways', async ({ page }) => {
    for (const hash of ['#hn', '#adventure', '#find', '#audit', '#tos']) {
      await page.goto(`/${hash}`)
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, hash).toBeLessThanOrEqual(1)
    }
  })
})

test('HN ticker classifies live comments', async ({ page }) => {
  await page.goto('/#hn')
  await page.getByRole('button', { name: 'Play the stream' }).click()
  await expect(page.locator('.comment .prob-num').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.meter')).toContainText('last call')
  await page.getByRole('button', { name: 'Pause the stream' }).click()
  const classified = await page.locator('.stat').first().locator('.stat-value').innerText()
  expect(Number(classified.replace(/,/g, ''))).toBeGreaterThan(0)
})

test('adventure maps free text to a move', async ({ page }) => {
  await page.goto('/#adventure')
  await page.getByLabel('Your command').fill('pick up the lamp please')
  await page.getByRole('button', { name: 'Go' }).click()
  await expect(page.locator('.decision').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.decision').first()).toContainText('sure')
})

test('find it draws a box on the painting', async ({ page }) => {
  await page.goto('/#find')
  await page.getByRole('button', { name: /bell the cat/i }).click()
  await expect(page.locator('.box-overlay')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.box-label')).toContainText('sure')
})

test('design audit returns a verdict for a sample', async ({ page }) => {
  await page.goto('/#audit')
  await page.getByRole('button', { name: /Checkout/ }).click()
  await expect(page.locator('.verdict')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.answer-key')).toContainText('rule 3 was planted')
})

test('TOS scan highlights clauses and answers a whole-document question', async ({ page }) => {
  await page.goto('/#tos')
  await page.getByRole('button', { name: /Scan for red flags/ }).click()
  await expect(page.locator('.flag-tag').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.overall')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Can they sell my personal data?' }).click()
  await expect(page.locator('.answer')).toContainText('likely', { timeout: 20_000 })
})

test.describe('API guards', () => {
  test('rejects unsupported question types and malformed bodies', async ({ request }) => {
    const bad = await request.post('/api/jev', {
      data: { state: 'hi', questions: { a: { type: 'chat', instructions: 'say hi' } } },
    })
    expect(bad.status()).toBe(400)
    const junk = await request.post('/api/jev', {
      data: 'not json',
      headers: { 'content-type': 'application/json' },
    })
    expect(junk.status()).toBe(400)
  })
})
