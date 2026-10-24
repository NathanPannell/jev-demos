# Agent notes

- Only `staging` and `main` create Vercel deployments (`git.deploymentEnabled` in `vercel.json`, with `ignoreCommand` as a second guard). Feature branches get no preview deployment. CI runs only for `main`, so local checks are the gate for PRs to `staging`.
