# Working on Debrief

This is a dependency-free Manifest V3 DevTools extension. Runtime files are at the repository root. Documentation and preview tooling are not runtime features.

- Read `README.md`, `SECURITY.md` and `CAPTURE.md` before changing capture or output behavior.
- Keep zero permissions, zero host access declarations, no outbound calls and no persistence of captured data. Do not add packages, telemetry, cloud services or generated lockfiles.
- `devtools.js` starts capture on the first panel selection. `store.js` owns in-memory lifecycle; page context is enabled by default and HTTP-only is an opt-out. Only `probe.js` may execute inside the inspected page.
- Captured strings are untrusted data. Use `textContent`/`value`; never execute or navigate to them. Use the shared redaction path for inspection and clipboard output.
- Redaction is heuristic. Do not claim complete anonymity or isolation from hostile pages. Keep raw copying explicit and scoped to one action.
- Run `node --experimental-default-type=module --test tests/*.test.js` and `node scripts/check-release.mjs`. Run the browser smoke check for UI/capture changes when a local Chrome binary is available; instructions are in `docs/MAINTAINING.md`.
- Use only synthetic fixtures, reserved example domains and relative paths. Never commit credentials, real captures, personal details, internal domains or browser profiles.
- Update docs and `CHANGELOG.md` when behavior changes. Do not describe design proposals as shipping features.
- Keep changes focused. Do not publish, tag or create releases unless the user has authorized it.
