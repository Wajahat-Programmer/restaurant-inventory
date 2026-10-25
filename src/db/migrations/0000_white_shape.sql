CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `count_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`count_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`counted_qty` real,
	`system_qty` real NOT NULL,
	FOREIGN KEY (`count_id`) REFERENCES `stock_counts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `count_lines_unique` ON `count_lines` (`count_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `item_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`original_path` text NOT NULL,
	`cutout_path` text,
	`thumb_path` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `item_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`price_per_base` real NOT NULL,
	`effective_date` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_prices_item` ON `item_prices` (`item_id`,`effective_date`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer,
	`base_unit` text NOT NULL,
	`par_level` real DEFAULT 0 NOT NULL,
	`reorder_point` real DEFAULT 0 NOT NULL,
	`shelf_life_days` integer,
	`barcode` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_name_unique` ON `items` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_barcode_unique` ON `items` (`barcode`);--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty_base` real NOT NULL,
	`total_paisa` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`date` text NOT NULL,
	`total_paisa` integer NOT NULL,
	`paid_paisa` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'POSTED' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_levels` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`qty_base` real DEFAULT 0 NOT NULL,
	`value_paisa` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`type` text NOT NULL,
	`qty_base` real NOT NULL,
	`value_paisa` integer NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` integer,
	`reason` text,
	`is_reversal` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movements_item` ON `stock_movements` (`item_id`,`id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier_id` integer NOT NULL,
	`purchase_id` integer,
	`date` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`opening_balance_paisa` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_unique` ON `suppliers` (`name`);--> statement-breakpoint
CREATE TABLE `unit_conversions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`pack_name` text NOT NULL,
	`factor_to_base` real NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_conv_item_pack` ON `unit_conversions` (`item_id`,`pack_name`);