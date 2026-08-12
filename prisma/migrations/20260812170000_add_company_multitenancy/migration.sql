-- CreateTable: companies (the SaaS tenant boundary)
CREATE TABLE `companies` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(150)  NOT NULL,
  `slug`       VARCHAR(100)  NOT NULL,
  `is_active`  BOOLEAN       NOT NULL DEFAULT true,
  `created_at` DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `companies_slug_key`(`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the existing real business as Company #1
INSERT INTO `companies` (`name`, `slug`, `is_active`, `created_at`)
VALUES ('Tyla Shop', 'tyla-shop', true, NOW());

-- Remove the empty, unused "Newgen Shop" branch (id 2) — verified zero rows
-- reference it in products/sales/expenses/users/audit_logs/capital_injections.
DELETE FROM `branches` WHERE `id` = 2;

-- AlterTable: branches gains company_id
ALTER TABLE `branches` ADD COLUMN `company_id` INT NULL;
UPDATE `branches` SET `company_id` = (SELECT `id` FROM `companies` WHERE `slug` = 'tyla-shop');
ALTER TABLE `branches` MODIFY COLUMN `company_id` INT NOT NULL;
ALTER TABLE `branches` ADD CONSTRAINT `branches_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX `branches_company_id_idx` ON `branches`(`company_id`);

-- Branch names are now unique per company, not globally
DROP INDEX `branches_name_key` ON `branches`;
CREATE UNIQUE INDEX `branches_company_id_name_key` ON `branches`(`company_id`, `name`);

-- Fix the one admin user with a NULL branch_id (was a "sees all branches" leftover
-- from the pre-single-store era) — assign them to the one real branch.
UPDATE `users` SET `branch_id` = 1 WHERE `branch_id` IS NULL;

-- AlterTable: users gains company_id (nullable — NULL is reserved for future superadmin accounts)
ALTER TABLE `users` ADD COLUMN `company_id` INT NULL;
UPDATE `users` u
  JOIN `branches` b ON b.`id` = u.`branch_id`
  SET u.`company_id` = b.`company_id`;
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_fkey`
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `users_company_id_idx` ON `users`(`company_id`);
