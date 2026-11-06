# M7 pinned monetary transfer adapters — root local acceptance

Base: `00b9062400343cd36219df4136b766ae81bdecbb`. Whole source candidate: `192fcad0a5e203902b51539f1921401ca7cc3d6c`. Isolated JSON-persistence closure: `bf65d085b665b3d2a3793019bb8717faa36e3fe6`. Root owns source and runtime. No production deployment, main merge, provider activation, real-data operation or emulator was involved. The main ledger remains **41/91**; these are prerequisite interfaces, not completion of Phase08.

## Delivered behavior

`captureMoneyExport` uses the existing bounded RepeatableRead operation, the shared provenance resolver and the M6 purchase-cost service. It independently rechecks the owner, live item and live parent, including when supplied a broader trusted predicate. Custom/catalogue references are validated even for an empty selection. It counts selected objects before materializing metadata, permits exactly 1,000 objects, and rejects 1,001. A private incremental builder checks the entire UTF-8 JSON envelope, coverage, totals and candidate row before append. Exactly 8,388,608 bytes are accepted; one byte more returns no snapshot. Multiple paths count toward the same byte budget. There is no partial result, truncation or per-item database query loop.

The deeply frozen snapshot pins read time, item title/current quantity, subject/raw pair, generation, sequence, effective event, origin, erasure and revocation identifiers. It excludes actors, reasons, evidence references/categories, private notes, locations, policies and document bytes. Later quantity changes or revocation affect new captures only. RAW and explicitly selected unresolved-list output omit all decimal fields and totals. Complete interpreted output gates the independent outer scope before matching and rejects selected missing/unknown/unsupported facts. Purchase totals use actual M6 exact quantity arithmetic and currency/unit/stored-exponent groups, independently crosschecked against captured rows. Custom/catalogue prices never become purchase-cost totals.

`validateMoneyImportRow` strictly pins NEW/REPLACE source rows, the selected M1 profile, source contract, receipt and SHA-256 digest. Commit validation takes the server-persisted expected preview and rejects changed source/identity/profile/preconditions/receipts. Canonical RAW requires its explicit contract. Explicit legacy UNKNOWN raw input has no profile, receipt or scale. Optional undefined mapping fields compare consistently after JSON persistence. Actual writer authorization/CAS and durable job idempotency remain Phase08 obligations. This adapter introduces no CSV/XLSX/PDF worker, artifact writer or import/export API.

## Evidence and source correspondence

One fresh-context review covered all nine original changed files and real resolver/auth/parser/coverage/cost dependencies: **SPEC PASS / QUALITY PASS, no findings**. A separate scoped inspection accepted the final seven-line JSON-persistence correction. Exact review scope and limitations are in `task-m7-review.md`.

- Full 70-file native CI allowlist at `192fcad`: **812 passed, zero skipped, 140.64s**. This includes all M1–M6 native guards, locking, erasure/revocation and the nine new M7 capture cases.
- After the isolated pure-comparison correction, all nine M7 native capture cases passed again on `bf65d08` (zero skips, 3.69s). Existing parsed subject/raw values have no undefined properties; the patch changes only optional object-property canonicalization. The broader native run above is attributed to its actual source, not relabelled as a new full run.
- Final full regular suite on `bf65d08`: **1,465 passed / 683 explicitly disabled native cases**, 11.47s. Disabled cases are not claimed as native execution.
- Final workspace typecheck, lint and production build passed.
- Final actual-built browser suite: **400 passed, zero skipped, 7.2min**. Feature-on monetary consumers: **8 passed, zero skipped, 7.7s**, covering DE/EN desktop/mobile. Database and browser runtimes ran serially.

Native cases prove ownership/live-parent reauthorization, empty foreign-reference refusal, 1,000/1,001 count before metadata/facts, 24 catalogue paths under one object, exact quantity groups and immutable snapshots after revocation, structural historical ZZZ without guessed scale, evidenced AFN scale0 versus new-authoring scale2, missing/ineligible refusal and actual statement-timeout closure without an artifact. Pure byte-boundary tests use an independent `Buffer.byteLength(JSON.stringify(snapshot))` oracle, multibyte text and 20 paths per item, including envelope and coverage.

Exact commands and genuine failures remain in `logs/task-m7-20261106-*.log`. Initial missing-module RED, type errors, an incorrect native fixture argument order and the JSON-roundtrip RED are retained. The latter had 14 passes/one failure before the minimal correction, then all 15 passed. The allowlist extractor initially counted lines instead of whitespace-separated filenames; its assertion prevented execution. It was corrected before the actual 70-file/812-pass run. No product guard, budget, source limit or test assertion was weakened.

## Publication and next work

M6 original PR run42268254760 succeeded; original push42268243443 failed one old browser response-body/navigation race after153/154 passes. The test-only correction `00b9062` passed 20 repetitions and the complete154-case monetary browser suite. Its fresh runs42272242129/42272230439 are still required before M7 publication. Root accepts M7 locally after all evidence above, allows the independent local Phase08 Task1 pipeline, and holds dependent publication until the predecessor gates pass. Stop affected work if an actual predecessor failure appears.

Phase08 must still implement real persisted jobs/rows/profiles, parsing, decisions, retry-safe inventory writes, protected artifacts and UI. Source preparation is in the separate Phase08 Task1 execution context. Full Phase07 market/sharing/duplicate/wishlist integration and the remaining V1 tasks are not claimed complete.

Publication gate update: both full corrected M6 workflows on00b9062400343cd36219df4136b766ae81bdecbb succeeded (PR42272242129, push42272230439). Root permits the M7 source/evidence push to the existing draft branch. Its new exact-head CI must then be observed; local Phase08 Task1 may continue under the documented pipeline rule.

Both complete M7 workflows on08fa12ea726fea4218d9e48c31533d3b1e6e0929 are now SUCCESS: PR42276619939 and push42276608472. Full job/step metadata is retained in logs/task-m7-20261106-ci-success.json. Root accepts this predecessor gate for subsequent Phase08 work.
