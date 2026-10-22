import {
  createJevHandler,
  createPreflightHandler,
  defaultLimiter,
  parseAllowedOrigins,
  parseBudget,
} from './_lib/handler.js'

const allowedOrigins = parseAllowedOrigins(process.env.JEV_ALLOWED_ORIGINS)

export const POST = createJevHandler({
  apiKey: process.env.OPENROUTER_API_KEY,
  fetch: (...args) => fetch(...args),
  limiter: defaultLimiter(),
  now: () => Date.now(),
  hourlyBudgetUsd: parseBudget(process.env.JEV_HOURLY_BUDGET_USD),
  allowedOrigins,
})

export const OPTIONS = createPreflightHandler(allowedOrigins)
