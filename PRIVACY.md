# Privacy

Debrief has no account, backend, analytics, telemetry, crash reporting, remote fonts, AI integration or runtime network calls. It is an independent project and is not affiliated with an employer or AI provider.

## What is processed

After you first open the Debrief panel, it receives completed requests and available bodies from the inspected tab's DevTools network log. Historical HAR metadata may also be available. **Page context is enabled by default (HTTP only is off).** HTTP headers and bodies can contain credentials and personal data.

Opening Debrief also starts a page probe that samples matching authentication storage keys, JavaScript-readable cookies, new top-frame errors and exposed Pusher instances. The probe operates in page-controlled JavaScript; see [SECURITY.md](SECURITY.md). Turn HTTP only on to stop page sampling and clear retained data. This choice lasts for the current DevTools session; a new session enables page context again. Capture continues while another DevTools panel is selected, until paused or DevTools closes. Navigating clears the previous capture; the selected capture mode remains active for the next page in that tab.

Each DevTools window has its own capture. The extension does not enumerate or collect from unrelated tabs.

## Retention and disclosure

Raw captured data is retained in bounded memory, not written to files or browser storage by Debrief. Redaction is applied to display and clipboard output; it is not encryption or anonymization of the in-memory capture. Clear, mode changes and navigation remove the active capture. Closing DevTools releases extension memory; page-side cleanup has a short best-effort lease.

Copying is user-initiated. Safe copies apply heuristic masking; raw copies require explicit confirmation each time. You control where the result is pasted. The extension cannot erase clipboard history, browser history, OS swap or crash dumps. It cannot detect every secret, personal fact or confidential business detail. Review output before sharing it.

## GitHub and development tools

Opening this repository on GitHub is separate from running the extension and is governed by GitHub's policies. CI checks public source and synthetic fixtures only. The preview/browser scripts start an isolated browser and may serve a synthetic app on loopback for testing; they are not shipped runtime behavior. Documentation links and provider credits do not cause the extension to contact those providers.

Report privacy vulnerabilities through [private security reporting](https://github.com/aljazbracko/debrief/security/advisories/new). Do not submit real captures in public issues.
