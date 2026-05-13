# Contributing to _hyperherald

`_hyperherald` follows the conventions of `_hyperscript` and `htmx`. Keep code small, predictable, and focused.

## Local setup

```bash
npm install
npm run build
npm test
```

## Pull requests

- One concern per PR.
- Match existing code style (no formatter enforced; just be consistent).
- Add a Playwright test for behavioral changes.
- Update `CHANGELOG.md` under an `## [Unreleased]` heading.
- Do not introduce client-side state, reactive signals, or template engines — those are explicit non-goals.

## Reporting bugs

Open a GitHub issue with:

- Minimal HTML reproduction
- Expected vs observed behavior
- Browser + version
- `_herald-debug="true"` console output if relevant

## Spec changes

The wire format is the contract. Spec changes go through `www/docs/spec.md` and require a version bump in the envelope `v` field while the project is `0.x`.
