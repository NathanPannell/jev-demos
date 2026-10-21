import { createJevHandler, defaultLimiter } from './_lib/handler.js'

export const POST = createJevHandler({
  apiKey: process.env.OPENROUTER_API_KEY,
  fetch: (...args) => fetch(...args),
  limiter: defaultLimiter(),
  now: () => Date.now(),
  hourlyBudgetUsd: Number(process.env.JEV_HOURLY_BUDGET_USD ?? '0.5'),
})
