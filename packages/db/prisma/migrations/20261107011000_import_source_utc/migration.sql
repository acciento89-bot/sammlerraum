-- Keep applied history unchanged; new source deadlines have an explicit UTC wall clock.
ALTER TABLE "ImportJob" ALTER COLUMN "sourceExpiresAt" SET DEFAULT (timezone('UTC',CURRENT_TIMESTAMP)+interval '24 hours');
