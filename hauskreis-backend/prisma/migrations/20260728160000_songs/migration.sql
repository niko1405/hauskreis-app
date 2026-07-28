
-- CreateTable
CREATE TABLE "song" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "lyrics_url" TEXT,
    "created_by_person_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_song_leader" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "meeting_song_leader_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- CreateTable
CREATE TABLE "meeting_song" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "suggested_by_person_id" UUID,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_song_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "song_hauskreis_id_idx" ON "song"("hauskreis_id");

-- CreateIndex
CREATE UNIQUE INDEX "song_hauskreis_id_title_artist_key" ON "song"("hauskreis_id", "title", "artist");

-- CreateIndex
CREATE INDEX "meeting_song_leader_person_id_idx" ON "meeting_song_leader"("person_id");

-- CreateIndex
CREATE INDEX "meeting_song_song_id_idx" ON "meeting_song"("song_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_song_meeting_id_song_id_key" ON "meeting_song"("meeting_id", "song_id");

-- AddForeignKey
ALTER TABLE "song" ADD CONSTRAINT "song_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song" ADD CONSTRAINT "song_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_song_leader" ADD CONSTRAINT "meeting_song_leader_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_song_leader" ADD CONSTRAINT "meeting_song_leader_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_song" ADD CONSTRAINT "meeting_song_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_song" ADD CONSTRAINT "meeting_song_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_song" ADD CONSTRAINT "meeting_song_suggested_by_person_id_fkey" FOREIGN KEY ("suggested_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

