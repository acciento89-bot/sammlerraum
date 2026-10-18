-- PostgreSQL numeric accepts NaN, which also satisfies >= 0. Explicitly bound
-- authored comparable values so direct SQL cannot persist a non-finite value.
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_comparable_finite_check"
  CHECK ("comparableValue" IS NULL OR "comparableValue" <= 99999999.9999);
