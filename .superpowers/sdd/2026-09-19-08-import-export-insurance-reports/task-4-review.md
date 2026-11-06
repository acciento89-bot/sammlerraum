# Task4 independent whole-candidate review

Read-only reviewer sammlerraum_exports_t4_review inspected d1a9016d5c321325350a88ac40fad39c665f9677..356e94e29e84a44568314a6a8ee0a8ae8ccefdcc. No runtime/test execution and no edits delegated. Full review original verdict: fix one P2 schema declaration, then merge if root whole gates pass. No demonstrated P0/P1 found.

P2: Prisma ExportJob omitted the status/lastDispatchedAt/id index already created by the additive dispatch migration. Future schema-generated migration could drop the polling index. Root closure adds exactly @@index([status,lastDispatchedAt,id]); both exercised migrations remain byte-for-byte unchanged. This is a schema/migration metadata correction, not changed export execution. Root validates Prisma and actual test-database index; no second independent PASS is fabricated.

Strengths acknowledged: actual ownership/lifecycle/whole-set M7 capture; opt-in-only private metadata/no document bytes; frozen retry source and fresh final validation; known private attempt assets/fences/atomic READY; retained asset lock through actual cancellation settlement; reversible named CSV transport and literal bounded XLSX.

Declined-to-judge rulings: root owns actual test/build evidence; no Excel/LibreOffice application run is claimed from ZIP/project-reader tests; authenticated delivery/expiry/UI explicitly belongs to Task7; live deployment/production migration is not this task. Root accepts these scope boundaries, recorded as integration obligations rather than silently dropped requirements.
