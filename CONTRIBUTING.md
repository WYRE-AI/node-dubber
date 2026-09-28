# Contributing to node-dubber

Thanks for helping improve the Dubber API client library.

## Development setup

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # GitHub Packages registry auth
npm install
```

## Workflow

- `npm run build` — tsup dual ESM + CJS build with declarations.
- `npm test` — vitest + MSW test suite (no network access; MSW errors on any unhandled request).
- `npm run lint` — TypeScript type check (`tsc --noEmit`).

All three must pass before a PR is merged.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) —
`feat:`, `fix:`, `docs:`, `chore:`, etc. — because semantic-release derives the
next version and changelog entry from them.

## A note on the API surface

Dubber does not publish a downloadable OpenAPI/JSON-Schema spec. Every
endpoint path in this client was verified against the live `/io-docs`
interactive console and the official Getting Started Guide
(support.dubber.net), but response body shapes are best-effort — widen the
`types/index.ts` interfaces from real API responses as you exercise this
client, rather than assuming they're complete.
