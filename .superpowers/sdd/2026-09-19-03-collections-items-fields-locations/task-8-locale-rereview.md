# Task 8 locale fixture rereview — dcf4ec2..e6c9e0c

## Verdict: approved for scoped fixture correction

The reported CI locale mismatch is explained by the route behavior: `apps/web/src/proxy.ts` sets `NEXT_LOCALE` on the exact `/de` or `/en` path, while the earlier fixture visited only the login path. The updated login helper visits that locale home page and asserts the cookie. The owner scan then supplies the opposite `Accept-Language`, exercising cookie precedence; the anonymous context supplies the expected header without a cookie, exercising the fallback. This is consistent with the neutral scan route's `selectLocale(cookieLocale, acceptLanguage)` call.

The diff preserves the prior anonymous valid/invalid redirect equivalence and foreign-owner 404 assertions, along with the label and content privacy checks. No new Important issue was found in this fixture-only change. The report records passing targeted web lint/typecheck; the production PostgreSQL/Chromium rerun remains pending CI. No suites were rerun here.
