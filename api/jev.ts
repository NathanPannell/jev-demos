import { createJevHandler, defaultLimiter, parseBudget } from './_lib/handler.js'

export const POST = createJevHandler({
  apiKey: process.env.OPENROUTER_API_KEY,
  fetch: (...args) => fetch(...args),
  limiter: defaultLimiter(),
  now: () => Date.now(),
  hourlyBudgetUsd: parseBudget(process.env.JEV_HOURLY_BUDGET_USD),
})
