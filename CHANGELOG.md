# Changelog

## 1.3.0 — 2026-09-23

First public release.

### Added

- HTTP-only mode, enabled by default. No page probe runs until the user turns HTTP-only off.
- Public setup, contribution, privacy, security reporting and maintenance documentation.
- Synthetic preview images and reproducible preview tooling.
- Dependency-free CI checks and an explicit-file-list release packager.

### Changed

- Capture starts when the Debrief panel is first selected, rather than when any DevTools panel opens.
- Switching capture mode clears retained data, selection and outstanding page samples.

### Included from the local prototype

- HTTP capture with headers, payload, response, timing and request filters; Fetch/XHR selected by default.
- Classic inspector, JSON tree/text views and a resizable split.
- One-click redacted Markdown and a deliberate per-copy raw escape hatch.
- Optional top-frame auth/error sampling and exposed Pusher connection summaries.

### Known limits

No WebSocket frames, complete local-storage browser, historical console recovery or guaranteed sensitive-data detection. See [CAPTURE.md](CAPTURE.md) and [SECURITY.md](SECURITY.md).
