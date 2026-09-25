# Contributing

Small, focused contributions are welcome. Debrief is an independent personal project. There is no guaranteed response time or commercial support.

## Local setup

Load the repository root as an unpacked Chrome extension; see [README.md](README.md). No npm install or build step is needed. Tests require Node.js 22 or later:

```sh
node --experimental-default-type=module --test tests/*.test.js
node scripts/check-release.mjs
```

Reload the extension in `chrome://extensions` after a runtime change, then close and reopen DevTools. Capture and the page probe start when Debrief is first selected. Use synthetic data and test HTTP-only mode as well; it stops page sampling and clears the capture.

## Changes worth proposing

Bug fixes, clearer redaction rules with synthetic regression cases, accessible interaction improvements, and smaller, more useful clipboard output. Open an issue before a large feature or an architectural change.

Preserve these constraints:

- No requested browser permissions, host permissions or runtime third-party dependencies.
- No outbound extension traffic, captured-data persistence or automatic clipboard writes.
- Render captured content as text. Never use it as executable code, HTML or a navigation target.
- Redact before truncation. Raw copy must remain a deliberate action for one copy.
- Bound memory and output. Label unavailable, sampled and omitted data honestly.
- Preserve HTTP-only mode and its zero page-evaluation behavior. Keep page-side code in `probe.js`.

Add tests for meaningful behavior changes, especially masking, capture lifecycle and clipboard scope. For UI changes, also check narrow DevTools widths, keyboard focus and native light/dark appearance. See [docs/MAINTAINING.md](docs/MAINTAINING.md) for the release checks.

## Pull requests and privacy

Explain the concrete problem, resulting behavior, and validation. Use only invented `example.test` hosts and synthetic values in fixtures or screenshots. Never include real HAR exports, customer records, tokens, internal domains, account screenshots or private file paths—even if a redactor appears to have removed them. Git history is public too.

AI-assisted contributions are welcome. Review the complete diff and test its behavior. Do not upload other people's private captures to an AI service. Contributors remain responsible for code quality and provenance; model output is not a security review.

Report vulnerabilities privately through [GitHub security advisories](https://github.com/aljazbracko/debrief/security/advisories/new), not public issues. Contributing code means contributing it under the [MIT license](LICENSE).
