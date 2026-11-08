# Sammlerraum complete V1 release checklist

This checklist separates tested source, production-like containers and actual public/customer operation. A successful source job is never a substitute for the later live checks. Original scope remains91tasks; preserve unaccepted tasks explicitly.

## Exact source and complete code gates

- Record original spec/plans, exact source commit and existing DraftPR1. Keep all prior proof and frozen migrations intact.
- Finish each phase's one whole-phase independent review and the one consolidated correction pass; record findings/disposition and exact source ranges. No retrospective review claim from old CI.
- Run `bash scripts/release-gate.sh` from a clean, committed checkout saved to the existing draft branch. It attaches to that exact source's CI (or manually dispatches the same CI if no run exists), waits, checks successful mandatory stages and writes a source-bound receipt. It never merges/deploys/activates providers.
- The CI runs frozen install/generation/migrations, recursive lint/types/workspace builds, real complete PostgreSQL17 tests through `test-native-complete.sh` with zero failed/skipped/todo tests, actual generated OpenAPI, DE/EN ICU message parity and the exhaustive API payment boundary.
- Compiled production-build browser gates must include existing ownership/search/collaboration/community/import/media/reporting journeys plus32AI,12Billing,84permission cells/cases and all four complete DE/EN desktop/mobile V1 flows. No fixture may bypass app ownership/policy checks or use live provider I/O.
- The same exact source must pass actual PostgreSQL17 dump/restore/integrity/negative checks and the real immutable production-like four-service stack: migrations, web/worker/database health, restart and retained DB/uploads receipts. The real web image must additionally serve authenticated exact original/variant bytes from separately restored DB/uploads while denying anonymous access. Static config contracts or a Python database-health fixture alone do not satisfy this.
- Retain exact CI head/run/job/mandatory-stage results. A failed, cancelled, skipped, missing or different-head gate is not acceptance. Do not resubmit unchanged failed jobs blindly.

## Prepare a reviewable deployment

- Identify matching immutable app/migration/PostgreSQL17 digests, host/Portainer environment, HTTPS hostname/proxy/certificate, persistent volume names, previous deployment digests and schema compatibility.
- Securely verify real auth secret, Google/Apple OAuth return origins and real verification/reset SMTP delivery. CI dummy values are not operational credentials.
- Configure the whole approved Free/Premium capability/limit policy explicitly. Record actual final prices/product IDs separately. Test prices and unrestricted synthetic quotas are not product decisions.
- Check deliberate money-authoring/canonical-consumer feature configuration against their accepted source gates; do not leave approved core UI invisibly unavailable because an old staging flag was copied.
- Keep AI, market adapters, payment I/O and notification-email dispatch off until their separate rights/keys/budgets/provider/delivery activation proof is authorized and complete. OAuth and required account SMTP likewise need actual operational validation. Record remaining external setup as unresolved, never replace full V1 with a smaller launch scope.
- Produce and actually restore-test a private current-deployment backup; record manifest SHA256 and protected recovery location. Separate encrypted runtime-secret recovery is also required. No public backup serving.
- Present the exact reviewed candidate, all pass/fail evidence, concrete live changes, remaining external prerequisites and rollback/recovery procedure for the separately required production authorization recorded in the V1 ledger.

## Actual production after authorization

- Drain old writers, keep DB/uploads volumes, perform guarded frozen migrations and deploy only the approved digests through Portainer. No automatic reverse migration or volume deletion.
- Prove real container readiness, application database health and PostgreSQL17; confirm persistent media access survives the rollout.
- Run `bash scripts/smoke-production.sh` against the actual owned HTTPS hostname. Both locales, health/OpenAPI, rejected unsigned webhook, missing random private media and absent marketplace payment endpoints must pass.
- Verify the full approved user-facing configuration and real service integrations using authorized own accounts/data; never make a real purchase, send to customers or activate paid providers merely to fill a test checkbox.
- Run the SEO/privacy/Lighthouse/Search Console gates from Phase14, including explicit default-off public indexing, real canonicals/sitemaps/social previews and actual authorized domain ownership evidence. Never submit private/unlisted/token/account URLs for indexing.
- Only then mark the corresponding production tasks complete and report actual availability. A TLS/hostname error or unavailable production page remains a blocker even when source tests pass.
