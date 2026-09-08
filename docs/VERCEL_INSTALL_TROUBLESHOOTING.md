# Vercel install troubleshooting

## `404 ... @skillpass/... Not found`

SkillPass is an npm workspace monorepo. Packages whose names start with `@skillpass/` are private local workspace packages and must never be downloaded from the public npm registry.

If Vercel prints an error similar to:

```text
npm error 404 Not Found ... @skillpass/delegation
The requested resource '@skillpass/delegation@...' could not be found
```

check that every internal dependency version exactly matches the version in that local package's `package.json`.

Run before pushing:

```bash
npm run verify:workspaces
npm test
```

The September 8, 2026 deployment failure was caused by the applications requesting `@skillpass/delegation@1.0.0` and `@skillpass/service-gateway@1.0.0` while the corresponding local workspace packages were version `1.2.0`. npm therefore attempted a registry lookup instead of workspace linking.

The repository now includes a regression test and `verify:workspaces` command so the mismatch is caught before deployment.

### About `127.0.0.1:8402` in Vercel logs

That address is part of the package-resolution environment visible during the build. The important diagnostic signal is not the loopback address itself; it is that npm attempted a registry GET for a private `@skillpass/*` package at all. With matching workspace versions, npm links the local package rather than fetching it.
