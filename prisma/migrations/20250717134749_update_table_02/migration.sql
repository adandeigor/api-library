/*
  Warnings:

  - You are about to drop the `Author` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `author` to the `Book` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LibraryStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Book" DROP CONSTRAINT "Book_authorId_fkey";

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "author" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Library" ADD COLUMN     "ifu" TEXT,
ADD COLUMN     "rccm" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "LibraryStatus" NOT NULL DEFAULT 'PENDING';

-- DropTable
DROP TABLE "Author";
