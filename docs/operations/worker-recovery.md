# Worker budgets, replay and shutdown

Each queue worker fetches one message at a time with one local handler and a one-second idle poll. Extra broker batch members are executed serially. Production container memory/CPU limits are an additional boundary; per-queue limits are not a global memory scheduler.

| Job | Broker active deadline |
| --- | ---: |
| media.process-image | 120 seconds |
| imports.parse-source | 300 seconds |
| imports.commit | 600 seconds |
| exports.build-tabular | 300 seconds |
| reports.build-insurance | 300 seconds |
| ai.analyze-item | 120 seconds |
| billing.sync-receipt | 120 seconds |
| notification.send-email | 120 seconds |
| market.sync | 120 seconds |

Generic producers use at most five retries, exponential backoff from five seconds capped at300seconds. AI and billing dispatchers deliberately send with zero broker retries because their durable domain attempt/next-attempt state is authoritative. Market sync retains its independently bounded transactional producer policy (two retries/30-second initial backoff). A broker deadline/AbortSignal is not evidence that a network call or SQL transaction has finished.

Image reads enforce the configured byte cap before allocating source bytes, validate the persisted length/hash and bound decoded pixels. Oversized storage is terminal; unavailable storage may retry. Existing configuration bounds imports to20MiB/10,000rows, image/document bytes and pixels, and AI admission budgets; individual handlers also retain their smaller provider/image/lease limits. Production configuration must not increase limits beyond available worker memory.

All side effects retain durable claims/revision fences/receipts. Completed import batches, image READY variants, AI immutable results and market poll receipts survive acknowledgement loss and redelivery. SMTP cannot promise exactly-once delivery across an ambiguous network outcome: an expired SENDING intent is quarantined as UNKNOWN and is not automatically submitted again. Do not clear it to force a retry without an operator investigation.

On SIGTERM/SIGINT, dispatchers stop, queue readiness falls, and pg-boss drains gracefully for30seconds. Application tracking then waits for actual invoked handlers to settle even if the broker's drain timer elapsed. Never disconnect the application database merely because an abort was signalled. If market or queue shutdown cannot prove settlement, shutdown reports failure and leaves database connections intact; the supervisor may eventually terminate the process. New workers recover durable leases normally. Configure the deployment stop grace period generously, and investigate repeated forced termination instead of weakening fencing or increasing retries indefinitely.

Proof includes narrow external-port crash simulations and actual PostgreSQL counterparts for broker cancellation, SQL import receipts, image READY, immutable AI results and email uncertainty. No real SMTP, AI or market provider is contacted in these tests.
