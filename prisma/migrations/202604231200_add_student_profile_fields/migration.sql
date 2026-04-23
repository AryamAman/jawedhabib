ALTER TABLE "Student"
ADD COLUMN "phone_e164" TEXT,
ADD COLUMN "phone_display" TEXT,
ADD COLUMN "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "profile_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Student"
SET "profile_completed" = CASE
  WHEN "phone_e164" IS NOT NULL THEN true
  ELSE false
END;

CREATE UNIQUE INDEX "Student_phone_e164_key" ON "Student"("phone_e164");
