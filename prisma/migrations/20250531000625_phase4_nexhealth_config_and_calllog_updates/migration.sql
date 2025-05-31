/*
  Warnings:

  - You are about to drop the column `nexhealth_api_key` on the `Practice` table. All the data in the column will be lost.
  - You are about to drop the column `vapi_api_key` on the `Practice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "booked_appointment_end_time" TIMESTAMP(3),
ADD COLUMN     "booked_appointment_nexhealth_id" TEXT,
ADD COLUMN     "booked_appointment_note" TEXT,
ADD COLUMN     "booked_appointment_operatory_id" TEXT,
ADD COLUMN     "booked_appointment_patient_id" TEXT,
ADD COLUMN     "booked_appointment_provider_id" TEXT,
ADD COLUMN     "booked_appointment_start_time" TIMESTAMP(3),
ADD COLUMN     "booked_appointment_type_id" TEXT;

-- AlterTable
ALTER TABLE "Practice" DROP COLUMN "nexhealth_api_key",
DROP COLUMN "vapi_api_key",
ADD COLUMN     "nexhealth_default_operatory_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nexhealth_selected_provider_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
