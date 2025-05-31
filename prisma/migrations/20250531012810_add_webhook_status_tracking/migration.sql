-- AlterTable
ALTER TABLE "Practice" ADD COLUMN     "webhook_error_message" TEXT,
ADD COLUMN     "webhook_last_attempt" TIMESTAMP(3),
ADD COLUMN     "webhook_last_success" TIMESTAMP(3),
ADD COLUMN     "webhook_status" TEXT DEFAULT 'UNKNOWN',
ADD COLUMN     "webhook_subscription_id" TEXT;
