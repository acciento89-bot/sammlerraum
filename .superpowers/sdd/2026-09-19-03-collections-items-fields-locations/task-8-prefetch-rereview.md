# Task 8 prefetch locale rereview — 3a6fda6..3aeca0e

## Verdict: approved for scoped correction

The prior fixture change established `NEXT_LOCALE` initially, but CI still observed the inverse locale at scan time. The proxy previously set the locale cookie on every exact `/de` or `/en` request, including the opposite-language link's speculative prefetch. The new guard skips cookie mutation for Next router prefetch and standard `purpose`/`sec-purpose` prefetch headers, while a deliberate navigation still sets the requested locale. Disabling prefetch on the two language links further avoids that speculative request. This correction fits the reproduced cause and introduces no new Important issue in the scoped diff.

The report records RED reproduction of the cookie overwrite and GREEN for three focused proxy tests, plus passing targeted lint/typecheck. The label journey's privacy assertions were not changed. Real production browser validation remains pending CI; no suite was rerun here.
