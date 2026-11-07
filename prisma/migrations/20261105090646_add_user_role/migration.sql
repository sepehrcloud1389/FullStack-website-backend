-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'AUTHOR', 'ADMIN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'MEMBER';
