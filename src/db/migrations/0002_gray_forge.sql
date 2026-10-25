CREATE TABLE `cash_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`direction` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`source` text NOT NULL,
	`ref_id` integer,
	`method` text DEFAULT 'cash' NOT NULL,
	`is_reversal` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_date` ON `cash_entries` (`date`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`note` text,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_date` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `recipe_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty_base` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_lines_unique` ON `recipe_lines` (`recipe_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sell_price_paisa` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_name_unique` ON `recipes` (`name`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`recipe_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`price_paisa` integer NOT NULL,
	`cogs_paisa` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_date` ON `sales` (`date`);
--> statement-breakpoint
-- Backfill: money already paid before the cash book existed.
INSERT INTO `cash_entries` (`date`, `direction`, `amount_paisa`, `source`, `ref_id`, `method`, `created_at`)
SELECT `date`, 'OUT', `paid_paisa`, 'purchase', `id`, 'cash', `created_at` FROM `purchases` WHERE `status` = 'POSTED' AND `paid_paisa` > 0;
--> statement-breakpoint
INSERT INTO `cash_entries` (`date`, `direction`, `amount_paisa`, `source`, `ref_id`, `method`, `created_at`)
SELECT `date`, 'OUT', `amount_paisa`, 'supplier_payment', `id`, `method`, `created_at` FROM `supplier_payments`;
