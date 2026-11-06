# H3 verification chronology (in progress)

BASE9238edd is product-equivalent to reviewed c7H2. Exact H2 workflows42128741219 and42128732803 both succeeded.

The initial absent-preview actual browser test failed on the missing heading after real authenticated HTTP creation; the first grep-only attempt matched no tests and is not product evidence. Pure state/client stubs failed behavior assertions before implementation. A second genuine state identity RED prevents malformed update state silently becoming a creation.

The initial actual unknown-create check proved that a committed/lost response left the old list looking fresh. The read hook now cancels pre-write reads and explicitly marks retained rows stale before mutations. The targeted stale-action RED then proved old rows were still editable; existing-record actions now require a fresh list.

First expanded browser run:41PASS/7FAIL. Four strict locator failures counted both visible conflict text and a hidden dialog; corrected test visibility, no product CAS change. Two desktop narrow checks exposed the real language-nav overflow (320viewport/403scroll width). The mobile-DE navigation after synthetic CSS zoom hit Playwright pointer-coordinate interception; zoom measurement and keyboard locale navigation are now separate, with zoom restored before navigation.

Second run:46PASS/2FAIL, both desktop CSS200percent checks. Actual overflow diagnostic720viewport/818scroll width again isolates language-nav, since media queries do not follow CSSzoom. Header now wraps at all widths, with small-screen gap; no hidden-overflow workaround. Targeted2RED covers stale row actions and zoom.

Expanded third run:64PASS0skip in59.6s, real authenticated PostgreSQL writes for success/conflict and committed-response-loss, transport manipulation only for stated faults/races. Includes actual moved-record/off-page inspection, wrong ACK+late pre-write read, fresh actor replacement/foreign denial, failed independent preview. Disabled controls received scoped visual styling afterwards; final frozen full regression is underway.

Pure set:1307PASS/501explicitDBskips,93passing/43gatedfiles. Whole-workspace types/lint/build and one combined234-case browser regression are being finalized. No physical Safari/iPhone/Duo, production deployment, provider action, task-count increase or full-phase completion claimed.
