# Independent Cloudflare Implementation Plan

> Execute inline; user authorized migration on 2026-11-16.

Goal: remove Sites runtime dependence and prepare owner-managed private deployment.
Architecture: existing Vinext frontend → own Workers; Access protects all enabled endpoints; localStorage retained.
Spec: approved migration proposal in conversation; no production data to migrate.

- [x] Replace hosting config with wrangler.jsonc; public/preview routes default off.
- [x] Remove Sites authentication/plugin/install wrappers; preserve business UI.
- [x] Add GitHub checks and opt-in production deployment, write operator guide.
- [ ] Typecheck, lint, build, dry-run, local smoke test and review.
- [ ] Confirm owner Cloudflare auth, deploy, configure Access and verify live access.

Review focus: generated config preserves disabled routes; no Sites runtime imports; clean CI install; no unauthenticated publication; user knows localStorage is not cloud storage.

Ruling: no backup migration needed because user has no formal data. Full backup and D1 are deferred, not required for hosting independence.
Ruling: existing checkout used because .git ref writes are sandbox-denied; no commit/push claimed.

Verification: private-route static checks and git diff --check passed. Build failed before app compilation due to missing ARM64 rolldown; whoami failed due to x64 workerd. registry.npmjs.org DNS unavailable. Deployment/CI/live checks remain pending.

Typecheck: tsc --noEmit passed (exit 0). Independent review: no confirmed routing/security defect; investigate pre-existing hydration effect lint before release.

Review disposition: targeted lint exemption for browser-storage hydration; no UI behavior changed. Lint timed out at 40s and 55s, not passed. Original checksum manifest regenerated for existing source files plus migration additions.
