# Changelog

## 1.4.2 — 2026-09-25

### Changed

- HTTP only now starts unchecked. Selecting Debrief enables page context by default, including matching auth storage, document cookies, new top-frame errors and exposed Pusher state. HTTP-only remains available to stop page sampling. Redaction and per-copy raw confirmation remain enabled.
- Updated capture, privacy, security and installation documentation to describe the new default.

### Fixed

- App state no longer reports that HTTP only is on when page context is enabled but a sample is not yet available.

## 1.4.1 — 2026-09-23

### Fixed

- The divider between the request list and the inspector can be dragged downward again. The list keeps the height you set instead of collapsing under the inspector.

## 1.4.0 — 2026-09-23

### Changed

- Replaced the single traffic layout with Brief, Requests, App state and Connections.
- Request rows are one 34px line: status, method, path, host and duration, so more of the capture stays visible.
- Brief shows the exact redacted report for the selected request. Copy brief stays in the footer. Each row still copies that request directly.
- App state and Connections show the existing top-frame auth sample and exposed Pusher summary. Values in App state stay redacted. This is not a full storage browser or a WebSocket frame viewer.

## 1.3.1 — 2026-09-23

### Changed

- Applied the Graphite visual system: neutral charcoal surfaces, restrained borders, platform UI typography, white primary actions, and color reserved for focus, selection, errors and connection state.
- Preserved compact request rows, filters, inspector behavior, redaction controls and the HTTP-only default.

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
