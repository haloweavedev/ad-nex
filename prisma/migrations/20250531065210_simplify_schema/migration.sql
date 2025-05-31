/*
  Warnings:

  - You are about to drop the column `booked_appointment_end_time` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_nexhealth_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_note` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_operatory_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_patient_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_provider_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_start_time` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `booked_appointment_type_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `call_status` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `call_timestamp_end` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `call_timestamp_start` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `detected_intent` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `ehr_appointment_foreign_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `nexhealth_appointment_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `nexhealth_patient_id` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `patient_phone_number` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `transcript_text` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `vapi_transcript_url` on the `CallLog` table. All the data in the column will be lost.
  - You are about to drop the column `nexhealth_default_operatory_ids` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `nexhealth_selected_provider_ids` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `vapi_phone_number_id` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `vapi_system_prompt_override` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_error_message` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_last_attempt` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_last_success` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_status` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_subscription_id` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the `ServiceMapping` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `started_at` to the `CallLog` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `Practice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nexhealth_subdomain` on table `Practice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nexhealth_location_id` on table `Practice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vapi_voice_id` on table `Practice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `vapi_first_message` on table `Practice` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ServiceMapping" DROP CONSTRAINT "ServiceMapping_practice_id_fkey";

-- AlterTable
ALTER TABLE "CallLog" DROP COLUMN "booked_appointment_end_time",
DROP COLUMN "booked_appointment_nexhealth_id",
DROP COLUMN "booked_appointment_note",
DROP COLUMN "booked_appointment_operatory_id",
DROP COLUMN "booked_appointment_patient_id",
DROP COLUMN "booked_appointment_provider_id",
DROP COLUMN "booked_appointment_start_time",
DROP COLUMN "booked_appointment_type_id",
DROP COLUMN "call_status",
DROP COLUMN "call_timestamp_end",
DROP COLUMN "call_timestamp_start",
DROP COLUMN "detected_intent",
DROP COLUMN "ehr_appointment_foreign_id",
DROP COLUMN "nexhealth_appointment_id",
DROP COLUMN "nexhealth_patient_id",
DROP COLUMN "patient_phone_number",
DROP COLUMN "transcript_text",
DROP COLUMN "vapi_transcript_url",
ADD COLUMN     "appointment_details" JSONB,
ADD COLUMN     "appointment_id" TEXT,
ADD COLUMN     "ended_at" TIMESTAMP(3),
ADD COLUMN     "patient_id" TEXT,
ADD COLUMN     "phone_number" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "Practice" DROP COLUMN "nexhealth_default_operatory_ids",
DROP COLUMN "nexhealth_selected_provider_ids",
DROP COLUMN "timezone",
DROP COLUMN "vapi_phone_number_id",
DROP COLUMN "vapi_system_prompt_override",
DROP COLUMN "webhook_error_message",
DROP COLUMN "webhook_last_attempt",
DROP COLUMN "webhook_last_success",
DROP COLUMN "webhook_status",
DROP COLUMN "webhook_subscription_id",
ADD COLUMN     "appointment_types" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "selected_provider_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tool_webhook_secret" TEXT NOT NULL DEFAULT 'laine-webhook-secret',
ADD COLUMN     "tool_webhook_url" TEXT,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "nexhealth_subdomain" SET NOT NULL,
ALTER COLUMN "nexhealth_location_id" SET NOT NULL,
ALTER COLUMN "vapi_voice_id" SET NOT NULL,
ALTER COLUMN "vapi_voice_id" SET DEFAULT 'jennifer',
ALTER COLUMN "vapi_first_message" SET NOT NULL,
ALTER COLUMN "vapi_first_message" SET DEFAULT 'Thank you for calling. This is Laine, your AI assistant. How can I help you today?';

-- DropTable
DROP TABLE "ServiceMapping";
