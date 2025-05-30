-- CreateTable
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "name" TEXT,
    "nexhealth_subdomain" TEXT,
    "nexhealth_location_id" TEXT,
    "nexhealth_api_key" TEXT,
    "vapi_api_key" TEXT,
    "vapi_assistant_id" TEXT,
    "vapi_phone_number_id" TEXT,
    "vapi_voice_id" TEXT,
    "vapi_system_prompt_override" TEXT,
    "vapi_first_message" TEXT,
    "timezone" TEXT DEFAULT 'America/New_York',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMapping" (
    "id" TEXT NOT NULL,
    "practice_id" TEXT NOT NULL,
    "spoken_service_name" TEXT NOT NULL,
    "nexhealth_appointment_type_id" TEXT NOT NULL,
    "default_duration_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "practice_id" TEXT NOT NULL,
    "vapi_call_id" TEXT NOT NULL,
    "call_timestamp_start" TIMESTAMP(3) NOT NULL,
    "call_timestamp_end" TIMESTAMP(3),
    "patient_phone_number" TEXT,
    "call_status" TEXT,
    "detected_intent" TEXT,
    "nexhealth_patient_id" TEXT,
    "nexhealth_appointment_id" TEXT,
    "transcript_text" TEXT,
    "summary" TEXT,
    "vapi_transcript_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Practice_clerk_user_id_key" ON "Practice"("clerk_user_id");

-- CreateIndex
CREATE INDEX "ServiceMapping_practice_id_idx" ON "ServiceMapping"("practice_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMapping_practice_id_spoken_service_name_key" ON "ServiceMapping"("practice_id", "spoken_service_name");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_vapi_call_id_key" ON "CallLog"("vapi_call_id");

-- CreateIndex
CREATE INDEX "CallLog_practice_id_idx" ON "CallLog"("practice_id");

-- CreateIndex
CREATE INDEX "CallLog_vapi_call_id_idx" ON "CallLog"("vapi_call_id");

-- AddForeignKey
ALTER TABLE "ServiceMapping" ADD CONSTRAINT "ServiceMapping_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
