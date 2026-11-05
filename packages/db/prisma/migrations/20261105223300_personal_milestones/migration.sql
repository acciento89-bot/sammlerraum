-- Private, explicitly owner-authored dates. No inferred inventory/history backfill.
CREATE TABLE "PersonalMilestone" (
  id UUID PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  title VARCHAR(120) NOT NULL,
  "milestoneDate" DATE NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalMilestone_revision_check" CHECK (revision BETWEEN 1 AND 2147483647),
  CONSTRAINT "PersonalMilestone_date_check" CHECK (isfinite("milestoneDate") AND "milestoneDate" >= DATE '0001-01-01' AND "milestoneDate" <= DATE '9999-12-31'),
  CONSTRAINT "PersonalMilestone_time_check" CHECK (
    isfinite("createdAt") AND isfinite("updatedAt") AND
    "createdAt" >= TIMESTAMPTZ '0001-01-01T00:00:00Z' AND
    "updatedAt" < TIMESTAMPTZ '10000-01-01T00:00:00Z' AND "updatedAt" >= "createdAt"
  ),
  CONSTRAINT "PersonalMilestone_title_check" CHECK (
    char_length(title) BETWEEN 1 AND 120 AND octet_length(title) <= 480 AND
    title COLLATE pg_catalog."C" = normalize(title, NFC) COLLATE pg_catalog."C" AND
    title !~ U&'[\0001-\001F\007F-\009F]' COLLATE pg_catalog."C" AND
    title COLLATE pg_catalog."C" = btrim(title,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)) COLLATE pg_catalog."C"
  )
);
CREATE INDEX "PersonalMilestone_owner_date_created_id_idx" ON "PersonalMilestone" ("ownerId", "milestoneDate" DESC, "createdAt" DESC, id DESC);
