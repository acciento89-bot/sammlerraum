#!/bin/zsh
set -eu
source ../sammlerraum-test-env.sh
taskLog=.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/logs
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm test > "$taskLog/task-5b2-final-regular-corrected.log" 2>&1
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm typecheck > "$taskLog/task-5b2-final-types.log" 2>&1
npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm lint > "$taskLog/task-5b2-final-lint.log" 2>&1
NODE_ENV=production npm exec --yes --package=node@24.19.0 --package=pnpm@10.17.1 -- pnpm build > "$taskLog/task-5b2-final-build.log" 2>&1
