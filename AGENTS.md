# Agent notes

- Only `staging` and `main` create Vercel deployments (`git.deploymentEnabled` in `vercel.json`, with `ignoreCommand` as a second guard). Feature branches get no preview deployment, so CI is the gate.
