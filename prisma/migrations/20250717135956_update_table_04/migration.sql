/*
  Warnings:

  - You are about to drop the column `libraryId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[managerId]` on the table `Library` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_libraryId_fkey";

-- AlterTable
ALTER TABLE "Library" ADD COLUMN     "managerId" INTEGER;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "libraryId";

-- CreateIndex
CREATE UNIQUE INDEX "Library_managerId_key" ON "Library"("managerId");

-- AddForeignKey
ALTER TABLE "Library" ADD CONSTRAINT "Library_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
