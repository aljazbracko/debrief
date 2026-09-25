# Security policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/aljazbracko/debrief/security/advisories/new). Include the affected version, impact and a minimal synthetic reproduction. Never include real tokens, browser profiles, HAR exports or customer data. Do not open public issues for undisclosed vulnerabilities.

Only the latest published release receives security fixes. This personal project has no guaranteed response time. Please coordinate disclosure after a fix is available. The checks below are source review and regression tests, not an independent security certification.

## What the supplied extension enforces

- Capture starts on first selection of Debrief, with page context enabled by default. The probe samples top-frame auth storage, document cookies, errors and exposed Pusher state. HTTP-only mode is an opt-out: enabling it detaches the probe and stops further sampling; starting capture in HTTP-only mode never evaluates page code. Mode changes clear retained data and invalidate outstanding samples. HTTP-only headers/bodies can still contain secrets.
- `permissions: []`; no host/optional permissions, background service worker, content script, web-accessible resource, or external messaging listener.
- Extension pages use `default-src 'none'` with only packaged scripts/styles allowed. Explicit `connect-src`, image, font, media, frame, object and worker directives deny those network/resource channels. `form-action 'none'` blocks form submission and `base-uri 'none'` blocks base URL substitution. There are no anchors, remote CSS URLs, navigation setters, resource URLs derived from captured data, or HTML injection sinks. HTML dialogs use `method="dialog"`, not navigation.
- All runtime imports are static local modules. No fetch, XHR, beacon, socket creation, analytics, reporting, external scripts, npm package or bundler exists. Reading HAR content does not replay the request.
- Page data is rendered using `textContent` / textarea `value`. It is never interpreted as HTML, Markdown, JavaScript, an import path, a selector or a URL to visit. Markdown uses a fence longer than any captured backtick run. Clipboard reports identify app content as untrusted diagnostic data; this is not a guarantee that a downstream LLM will resist prompt injection.
- The single `inspectedWindow.eval` call site only serializes the shipped `pageProbe` function, a random extension-generated identifier, and a validated fixed command. Captured URLs, headers, bodies or user text are never interpolated into executable code.
- There are no writes to local/session storage, IndexedDB, caches, browser storage, files or remote destinations. Auth **reads** happen only in the inspected page. Clear/navigation invalidates outstanding callbacks so old data cannot reappear. No logs of captured data are emitted.
- Clipboard output is always redacted unless the specific raw-copy dialog is confirmed. Raw mode is an argument to one formatter invocation, never a setting. The raw warning stays visible until the next normal copy or Clear. Raw dialog fallback text is erased from its textarea on close.

## Limits on the guarantee

CSP restricts **extension contexts**, not Chrome itself or the inspected app. `inspectedWindow.eval` executes in the app's main world: reading storage, global properties, proxies, and calling built-ins can invoke page modifications. The probe avoids application getters while serializing console objects and does not call Pusher methods, but cannot establish trusted intrinsics in an arbitrary page without a different architecture. The console wrapper forwards the app's existing console behavior exactly once. A pre-existing custom console reporter can still send the app's logs as it did before. An ordinary CSP also does not prove that every conceivable future navigation/API mistake is impossible. The auditable claim is that the shipped extension initiates no outbound traffic and has the listed blocked channels; **not** mathematical noninterference against arbitrary modifications or a hostile app. Chrome documents this main-world trust boundary in its [inspectedWindow API](https://developer.chrome.com/docs/extensions/reference/api/devtools/inspectedWindow).

Transient error capture necessarily has a small page-side queue. It is drained every second and has an inactivity cleanup lease; if the page is paused in a debugger or the browser suspends timers, cleanup waits until JavaScript can resume. Best-effort DevTools unload cleanup is not a browser-guaranteed synchronous close notification. The extension writes no capture files, but cannot control OS swap, browser crash dumps, Chrome's own Network history, clipboard managers, or where you paste. Redaction is a heuristic and cannot certify arbitrary prose as anonymous. Base64/binary data and very large bodies are omitted rather than partially decoded; JSON escaping and percent encoding are handled, but arbitrary encryption/custom encodings are not.

## Verify yourself

1. Inspect `manifest.json`, then search the runtime files for network APIs, URL-setting DOM operations, storage writes and dynamic execution. `tests/core.test.js` performs a static regression check; it is evidence against accidental additions, not a formal proof.
2. Read `probe.js` in full. This is all code executed in the inspected app. Its lease, console interception, storage allowlist and Pusher lookups are visible together.
3. Read `redact.js`, especially `POLICY`, `collectSensitive`, and the text/structured-data paths. Add fixtures for your application's secrets and personal data before extending a rule. `format.js` applies redaction before truncation and marks omissions.
4. Use a disposable local app with synthetic credentials. Inspect an auth failure, query token, JSON body, response email and nearby error. Compare the preview and copied Markdown. Confirm raw copy once, then make a normal copy and verify redaction is restored.
5. Check Chrome's extension-page Network/CSP diagnostics. The app's own traffic continues normally; it is not extension egress. The extension's `connect-src 'none'` can be verified by attempting a connection from that extension page's console and observing a CSP rejection.

API references: [DevTools network and body availability](https://developer.chrome.com/docs/extensions/reference/api/devtools/network), [extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy), and [Pusher instance structure](https://github.com/pusher/pusher-js/blob/master/src/core/pusher.ts). The extension does not open these URLs; they are documentation links only.
