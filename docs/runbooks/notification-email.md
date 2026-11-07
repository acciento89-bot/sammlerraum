# Notification email delivery

The notification mail worker is off by default. Source readiness and mock/owned-database tests are not evidence of production SMTP activation or real delivery. Authentication email retains its existing independent sender.

Activation requires an explicit operator decision, NOTIFICATION_EMAIL_ENABLED=true and complete APP_ORIGIN, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and SMTP_FROM. Store actual credentials only in the operator secret store. The adapter requires verified TLS (implicit TLS or STARTTLS), bounded connection/socket timeouts and a separate transport per delivery. Never disable certificate verification.

Durable states:
- PENDING: eligible at nextAttemptAt; outbox retries queue outages.
- CLAIMED: a short lease before transport. An expired pre-send lease can be reclaimed without consuming a send attempt.
- SENDING: persisted immediately before transport; no database transaction spans SMTP I/O.
- SENT: provider acceptance and message ID persisted. Replayed queue jobs do not send again. Acknowledgement writes are retried without repeating SMTP.
- UNKNOWN: possible provider acceptance, expired SENDING or cancellation during transport. Automatic resend is prohibited. Operator reconciliation must check actual provider/message-ID evidence before any explicit recovery; an UNKNOWN record is not proof of delivery or of non-delivery.
- FAILED: at most three proven nonaccepted send attempts.
- SUPPRESSED: recipient erased/unverified, current opt-out or blocked community interaction. No replay on later re-enabling.

The queue can retry jobs; plain SMTP cannot guarantee exactly-once delivery across an ambiguous acceptance/process crash. Deterministic Message-ID helps reconciliation but is not a recipient-server deduplication guarantee.

Before sending, the worker rechecks current verified recipient, category/channel preference and community blocks. Required security email cannot be disabled. Optional email requires opt-in. Templates are DE/EN, with generic subjects and authenticated own-app links; no private item notes, report reasons or arbitrary user text/URLs are embedded. Logs contain generic failure classes only. Recipient account erasure cascades delivery data; no delivery row recreates an erased account or notification.
