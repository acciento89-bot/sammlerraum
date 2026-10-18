import { BaseSequencer } from "vitest/node";
import { relative } from "node:path";
const order = [
  "packages/domain/src/media/media-service.test.ts",
  "packages/domain/src/custom-fields/custom-field-service.test.ts",
  "packages/domain/src/locations/location-service.test.ts",
  "packages/domain/src/items/item-service.test.ts",
  "packages/domain/src/collections/collection-service.test.ts",
  "packages/domain/src/items/identifier-service.test.ts",
  "packages/domain/src/identity/profile-service.test.ts",
  "packages/storage/src/staging-lock.integration.test.ts",
  "packages/domain/src/identity/security-service.test.ts",
  "packages/domain/src/media/cleanup-service.test.ts",
  "packages/db/src/media-lock.integration.test.ts",
  "packages/db/src/media-migration.integration.test.ts",
  "packages/db/src/postgres.integration.test.ts",
  "packages/queue/src/postgres.integration.test.ts",
  "apps/web/src/lib/catalog-history-routes.integration.test.ts",
  "apps/web/src/lib/catalog-link-routes.integration.test.ts",
  "apps/web/src/lib/catalog-proposal-routes.integration.test.ts",
  "apps/web/src/lib/condition-routes.integration.test.ts",
  "apps/web/src/lib/grading-routes.integration.test.ts",
  "apps/web/src/lib/item-search-routes.integration.test.ts",
  "apps/web/src/lib/security-service.integration.test.ts",
  "apps/web/src/lib/smart-collection-routes.integration.test.ts",
  "apps/web/src/lib/valuation-routes.integration.test.ts",
  "apps/worker/src/jobs/image-repository.integration.test.ts",
  "apps/worker/src/jobs/market-request-permit.integration.test.ts",
  "apps/worker/src/jobs/market-sync.integration.test.ts",
  "apps/worker/src/jobs/production-market.integration.test.ts",
  "packages/domain/src/catalog/catalog-history-service.test.ts",
  "packages/domain/src/catalog/catalog-read-service.test.ts",
  "packages/domain/src/catalog/catalog-service.integration.test.ts",
  "packages/domain/src/catalog/category-template-service.integration.test.ts",
  "packages/domain/src/catalog/initialize-catalog.test.ts",
  "packages/domain/src/catalog/item-catalog-link.test.ts",
  "packages/domain/src/catalog/proposal-service.test.ts",
  "packages/domain/src/condition/condition-service.test.ts",
  "packages/domain/src/grading/grading-service.test.ts",
  "packages/domain/src/market-data/market-data-service.test.ts",
  "packages/domain/src/media/media-management.integration.test.ts",
  "packages/domain/src/media/media-read.integration.test.ts",
  "packages/domain/src/search/item-search-service.test.ts",
  "packages/domain/src/search/search-read.integration.test.ts",
  "packages/domain/src/search/search-retained-integrity.integration.test.ts",
  "packages/domain/src/search/smart-collection-service.test.ts",
  "packages/domain/src/valuations/valuation-query.test.ts",
  "packages/domain/src/valuations/valuation-service.test.ts",
  "apps/web/src/app/api/v1/items/resource-route.integration.test.ts"
];
export default class BudgetSequence extends BaseSequencer {
  async sort(files) {
    const key = file => relative(process.cwd(), file.moduleId);
    if(process.env.SEARCH_BUDGET_PREFLIGHT === "1") {
      if(files.length!==1 || key(files[0])!=="packages/domain/src/search/search-native-budget-preflight.test.ts") throw Error("Diagnostic preflight allowlist mismatch");
      return files;
    }
    if(files.length!==46 || files.some(file=>!order.includes(key(file)))) throw Error("Diagnostic exact allowlist mismatch");
    const sorted = [...files].sort((a,b)=>order.indexOf(key(a))-order.indexOf(key(b)));
    console.info("BUDGET_NATIVE_ORDER", JSON.stringify(sorted.map(key)));
    return sorted;
  }
}
