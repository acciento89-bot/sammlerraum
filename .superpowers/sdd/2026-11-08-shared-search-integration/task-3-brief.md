### Task 3: Scoped saved definitions and dashboard consumers

**Files:** Extend contracts/smart-collections.ts compatibly with explicit v2 target definitions; adapt domain saved service through a trusted scoped resolver. Add strict scoped dashboard contract/service.

- [ ] TDD v1 unchanged, v2 current access/resolution, no persisted credentials, wrong/revoked grant and actual live changes. Test dashboard counts and permitted sums against the same selected relation; ungranted data remains unavailable/null.
- [ ] Implement symbolic target persistence and live resolution plus scoped summary projection; never redirect failed scoped queries to OWNED or serialize ungranted facts.
- [ ] Run native saved/dashboard/privacy regression, types and commit.

