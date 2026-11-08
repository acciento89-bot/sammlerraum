CREATE INDEX "BillingWebhookReceipt_processing_expiry_idx" ON "BillingWebhookReceipt" (provider,"leaseExpiresAt","createdAt",id) WHERE status='PROCESSING';
CREATE INDEX "BillingWebhookReceipt_pending_due_idx" ON "BillingWebhookReceipt" (provider,"nextAttemptAt","createdAt",id) WHERE status='PENDING';
