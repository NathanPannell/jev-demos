import { expect, test } from '@playwright/test'

test('home page loads and the API answers', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Jev Demos' })).toBeVisible()
  const res = await request.get('/api/health')
  expect(res.ok()).toBe(true)
})
