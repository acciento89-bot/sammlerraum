#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Owned PostgreSQL17 test database required}"
node --input-type=module - <<'JS'
const url = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test') || process.env.NODE_ENV === 'production') throw Error('Owned loopback _test database required');
JS
proof_dir=.superpowers/sdd/2026-09-19-13-integration-hardening-release
mkdir -p "$proof_dir"
report="$proof_dir/whole-native.json"
RUN_DATABASE_INTEGRATION=1 pnpm exec vitest run --maxWorkers=1 --reporter=default --reporter=json --outputFile.json="$report"
node --input-type=module - "$report" <<'JS'
import { readFileSync } from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
if (!report.success || report.numFailedTests || report.numFailedTestSuites || report.numPendingTests || report.numTodoTests || !(report.numPassedTests>3000)) throw Error('Complete actual native V1 gate requires zero failed/skipped/todo tests');
console.log(`Full native V1: ${report.numPassedTests} passed; 0 skipped; 0 failed`);
JS
