CREATE TABLE `audit_events` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`actor_id` text NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_business_date` ON `audit_events` (`business_id`,`at`);--> statement-breakpoint
CREATE TABLE `business_users` (
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`business_id`, `user_id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "owner_role" CHECK("business_users"."role"='owner')
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`write_token` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conflict_reviews` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`at` integer NOT NULL,
	`resolved` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_resolved" CHECK("conflict_reviews"."resolved" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `corrections` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`sale_id` text NOT NULL,
	`at` integer NOT NULL,
	`total` integer NOT NULL,
	`reason` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`,`sale_id`) REFERENCES `sales`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "correction_total" CHECK("corrections"."total">=0)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_price" CHECK("products"."price">=0),
	CONSTRAINT "product_quantity" CHECK("products"."quantity">=0)
);
--> statement-breakpoint
CREATE TABLE `recovery_limits` (
	`subject` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recovery_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recovery_account` ON `recovery_tokens` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `repayments` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`customer_id` text NOT NULL,
	`amount` integer NOT NULL,
	`at` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`,`customer_id`) REFERENCES `customers`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "repayment_amount" CHECK("repayments"."amount">0)
);
--> statement-breakpoint
CREATE INDEX `repayments_customer` ON `repayments` (`business_id`,`customer_id`,`at`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`business_id` text NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`business_id`, `sale_id`, `product_id`),
	FOREIGN KEY (`business_id`,`sale_id`) REFERENCES `sales`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`,`product_id`) REFERENCES `products`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_quantity" CHECK("sale_items"."quantity">0),
	CONSTRAINT "item_price" CHECK("sale_items"."price">=0)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`at` integer NOT NULL,
	`total` integer NOT NULL,
	`customer_id` text,
	`method` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`,`customer_id`) REFERENCES `customers`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_total" CHECK("sales"."total">0)
);
--> statement-breakpoint
CREATE INDEX `sales_business_date` ON `sales` (`business_id`,`at`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`product_id` text,
	`delta` integer NOT NULL,
	`at` integer NOT NULL,
	`reason` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`,`product_id`) REFERENCES `products`(`business_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "movement_nonzero" CHECK("stock_movements"."delta"<>0)
);
--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`business_id` text NOT NULL,
	`id` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	PRIMARY KEY(`business_id`, `id`),
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "operation_status" CHECK("sync_operations"."status" IN ('accepted','rejected'))
);
