CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`action` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_account_date` ON `security_events` (`account_id`,`at`);