/** Broker bounds complement, never replace, durable domain claims and transport cancellation. */
const jobSeconds: Readonly<Record<string, number>> = Object.freeze({
  "media.process-image": 120,
  "imports.parse-source": 300,
  "imports.commit": 600,
  "exports.build-tabular": 300,
  "reports.build-insurance": 300,
  "ai.analyze-item": 120,
  "billing.sync-receipt": 120,
  "market.sync": 120,
  "notification.send-email": 120,
});
export function brokerJobPolicy(name: string) {
  return {
    expireInSeconds: Object.hasOwn(jobSeconds, name) ? jobSeconds[name]! : 120,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 300,
  } as const;
}
export const WORKER_FETCH_POLICY = Object.freeze({
  batchSize: 1,
  localConcurrency: 1,
  pollingIntervalSeconds: 1,
});
