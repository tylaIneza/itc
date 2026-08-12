-- Permission catalog gains a module grouping (adopted from production's richer set)
ALTER TABLE `permissions` ADD COLUMN `module` VARCHAR(50) NULL;

-- Users gain a force-password-change flag (adopted from production)
ALTER TABLE `users` ADD COLUMN `force_password_change` BOOLEAN NOT NULL DEFAULT false;

-- Product categories (adopted from production — products had no category before)
CREATE TABLE `categories` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100)  NOT NULL,
  `description` VARCHAR(255)  NULL,
  `is_active`   BOOLEAN       NOT NULL DEFAULT true,
  `created_at`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `products` ADD COLUMN `category_id` INT NULL;
ALTER TABLE `products` ADD COLUMN `selling_price` DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `products_category_id_idx` ON `products`(`category_id`);

-- Replace the old coarse-grained permission catalog with the richer, per-action
-- set adopted from production. Cascades to role_permissions/user_permissions.
DELETE FROM `permissions` WHERE `name` IN (
  'can_sell', 'can_view_reports', 'can_manage_stock', 'can_manage_expenses',
  'can_manage_users', 'can_view_audit_logs', 'can_export_reports', 'can_approve_expenses'
);
