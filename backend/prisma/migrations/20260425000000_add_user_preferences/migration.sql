-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "home_modules" TEXT[] DEFAULT ARRAY['hero', 'milestone', 'trustcues', 'secondary']::TEXT[],
    "notification_cadence" TEXT NOT NULL DEFAULT 'weekly',
    "motivational_tone" TEXT NOT NULL DEFAULT 'direct',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "first_day_of_week" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
