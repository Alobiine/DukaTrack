PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE accounts_email_upgrade (
  id text PRIMARY KEY NOT NULL,
  phone text,
  email text,
  owner text NOT NULL,
  business text NOT NULL,
  password text NOT NULL,
  salt text NOT NULL,
  failures integer DEFAULT 0 NOT NULL,
  locked_until integer DEFAULT 0 NOT NULL,
  created_at integer NOT NULL
);
--> statement-breakpoint
INSERT INTO accounts_email_upgrade (id,phone,owner,business,password,salt,failures,locked_until,created_at)
SELECT id,phone,owner,business,password,salt,failures,locked_until,created_at FROM accounts;
--> statement-breakpoint
DROP TABLE accounts;
--> statement-breakpoint
ALTER TABLE accounts_email_upgrade RENAME TO accounts;
--> statement-breakpoint
CREATE UNIQUE INDEX accounts_phone_unique ON accounts(phone);
--> statement-breakpoint
CREATE UNIQUE INDEX accounts_email_unique ON accounts(email);
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
