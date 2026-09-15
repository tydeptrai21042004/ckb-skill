# npm transitive lockfile

All direct dependencies in the repository are pinned to exact versions and `dependency-versions.lock.json` detects workspace declaration drift. A root npm `package-lock.json` should additionally be generated and committed from an online Node 24 environment before a high-risk production/mainnet release:

```bash
rm -rf node_modules
npm install --package-lock-only --ignore-scripts
npm ci
npm test
npm run security:preflight
```

Do not hand-edit or synthesize a partial `package-lock.json`; an incomplete npm lockfile is worse than an explicit missing-lock warning because `npm ci` may fail or resolve an invalid graph.
