
-- CreateEnum
CREATE TYPE "topic_status" AS ENUM ('RUNNING', 'COMPLETED');

-- AlterTable
ALTER TABLE "meeting" ADD COLUMN     "topic_id" UUID;

-- CreateTable
CREATE TABLE "topic" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "title" TEXT,
    "status" "topic_status" NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_responsible" (
    "topic_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "topic_responsible_pkey" PRIMARY KEY ("topic_id","person_id")
);

-- CreateIndex
CREATE INDEX "topic_hauskreis_id_status_idx" ON "topic"("hauskreis_id", "status");

-- CreateIndex
CREATE INDEX "topic_responsible_person_id_idx" ON "topic_responsible"("person_id");

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_responsible" ADD CONSTRAINT "topic_responsible_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_responsible" ADD CONSTRAINT "topic_responsible_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

