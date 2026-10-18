#!/bin/zsh
set -eu
source ../sammlerraum-test-env.sh
taskLog=.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs
RUN_DATABASE_INTEGRATION=1 npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm vitest run --no-file-parallelism packages/domain/src/search/search-reference-service.integration.test.ts apps/web/src/lib/search-reference-routes.integration.test.ts packages/domain/src/search/search-read.integration.test.ts packages/domain/src/search/search-retained-integrity.integration.test.ts packages/domain/src/search/item-search-service.test.ts packages/domain/src/search/smart-collection-service.test.ts packages/domain/src/catalog/catalog-read-service.test.ts packages/domain/src/catalog/category-template-service.integration.test.ts packages/domain/src/condition/condition-service.test.ts apps/web/src/lib/item-search-routes.integration.test.ts apps/web/src/lib/private-search-routes.integration.test.ts apps/web/src/lib/dashboard-routes.integration.test.ts apps/web/src/lib/smart-collection-routes.integration.test.ts apps/web/src/lib/catalog-link-routes.integration.test.ts apps/web/src/lib/condition-routes.integration.test.ts > "$taskLog/task-5b2-final-native.log" 2>&1
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm test > "$taskLog/task-5b2-final-regular.log" 2>&1
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck > "$taskLog/task-5b2-final-types.log" 2>&1
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm lint > "$taskLog/task-5b2-final-lint.log" 2>&1
NODE_ENV=production npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm build > "$taskLog/task-5b2-final-build.log" 2>&1
