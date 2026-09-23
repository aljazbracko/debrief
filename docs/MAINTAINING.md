# Maintaining and releasing

## Checks

```sh
node --experimental-default-type=module --test tests/*.test.js
node scripts/check-release.mjs
python3 scripts/package.py
```

The automated source checks catch common regressions and accidental file additions. They are not a proof that all sensitive data or hostile-page behavior has been identified.

For browser validation with a separately installed Chrome for Testing or Chromium:

```sh
CHROME_BINARY='/path/to/chrome' node scripts/browser-smoke.mjs
CHROME_BINARY='/path/to/chrome' node scripts/preview.mjs
```

Use a Chrome binary that supports `--load-extension` (such as Chrome for Testing); branded Chrome builds may reject command-line extension loading. The scripts use a fresh temporary profile and a mock keychain. They never attach to your normal browser profile or copy to your real clipboard. The smoke test serves only a synthetic loopback app. Preview fixtures are invented `example.test` data and use the shipped UI. Generated browser profiles are removed at exit; no real site should be inspected during these checks.

Also load unpacked manually in the minimum supported Chrome version before claiming a newly tested version floor. Verify first-open capture, HTTP-only default, opt-in page context, pause/resume, clear/navigation, keyboard access, raw confirmation and safe-copy restoration. Automated tests do not cover every Chrome/OS combination.

## Release checklist

1. Update the manifest, visible version label, README install filename and changelog together.
2. Run the checks above; inspect the screenshots and synthetic Markdown output.
3. Review every staged path and the complete diff. No real captures, internal hostnames, personal emails, absolute home paths, conversation transcripts or developer profiles may be included. Use a GitHub noreply address for commits.
4. Check CI on the exact commit being released. Review permissions/CSP separately from functionality.
5. Build with the allowlist-based packager, inspect the archive entries and load its extracted folder in Chrome. The archive contains only runtime files, icon assets, license and essential security/capture docs.
6. Create an annotated `vX.Y.Z` tag and GitHub release on that commit. Attach the generated ZIP and SHA-256 checksum. Describe the actual behavior and material limitations.
7. Keep private vulnerability reporting enabled. Update the supported-version statement when old releases are no longer maintained.

Do not publish source previews from real applications, even if they appear redacted. Do not add external badge/image URLs to the README just for decoration. Provider credits describe development assistance and must not imply endorsement or runtime AI calls.
