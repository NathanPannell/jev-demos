# Jev Demos

One website with a tab per demo of TypeSafe's Jev 1.14 (a typed decision model), called through OpenRouter.

Demos: HN comment ticker, text-adventure command parser, find-it in a picture, design-rule screenshot audit, and a terms-of-service red-flag finder.

## Develop

```bash
npm ci
OPENROUTER_API_KEY=... npm run dev
```

## CI gate

`.github/workflows/ci.yml` runs on every PR to `staging` and `main`: lockfile install, Prettier, ESLint with zero warnings, `tsc`, Vitest with a coverage floor (thresholds in `vite.config.ts`), the production build, Playwright e2e against `vite preview` of the built app (which also serves `/api`), `npm audit --audit-level=high`, a no-`.env` check and a gitleaks scan. There is no database, so there is no migration job.
