/*
  Warnings:

  - You are about to drop the column `address_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `addresses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "addresses" DROP CONSTRAINT "addresses_user_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_address_id_fkey";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "address_id",
ADD COLUMN     "address_city" TEXT,
ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "address_postal" TEXT,
ADD COLUMN     "address_province" TEXT;

-- DropTable
DROP TABLE "addresses";
