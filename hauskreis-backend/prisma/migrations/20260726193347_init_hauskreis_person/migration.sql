-- CreateTable
CREATE TABLE "hauskreis" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hauskreis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "keycloak_user_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "birthdate" DATE,
    "plays_instrument" BOOLEAN NOT NULL DEFAULT false,
    "can_host" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_keycloak_user_id_key" ON "person"("keycloak_user_id");

-- CreateIndex
CREATE INDEX "person_hauskreis_id_idx" ON "person"("hauskreis_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_hauskreis_id_email_key" ON "person"("hauskreis_id", "email");

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
