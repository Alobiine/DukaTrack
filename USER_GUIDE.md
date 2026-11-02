# DukaTrack user guide

Website: https://dukatrack.alobiine.workers.dev

DukaTrack records sales, stock and customer credit for one business owner. Amounts are in Ugandan shillings (UGX); reports use Uganda time.

## Start and sign in

1. Open DukaTrack while connected to the internet.
2. Choose **Create account** and enter your business name, owner name, email and password. Use an email address you can access and a password of at least eight characters.
3. For later visits, sign in with the same email and password. Three incorrect passwords temporarily lock login for 30 seconds.

An existing phone-based account can use **Already have a phone-based account?** on the sign-in page. Creating a new email account does not transfer records from an old account. Linking an email to an old phone account is not available yet.

On another device, sign in to the same business account and sync to retrieve its cloud records. Each account has its own workspace.

## Install on your phone

- **Android:** Open the website in Chrome. Use the menu's **Add to home screen / Install** option.
- **iPhone:** Open the website in Safari. Choose **Share → Add to Home Screen** and enable **Open as Web App** if offered.

Open the installed icon online, sign in and wait for records to sync before relying on offline access. Installation details can vary by browser version: [Android instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en), [iPhone instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

## Add products and manage stock

1. Open **Stock**, then **Add product**.
2. Enter the product name, selling price, opening stock and low-stock threshold.
3. Save the product.

Use **Edit** to correct a product's name, price or threshold. To change existing stock, choose **Adjust**, select whether to add or reduce stock, enter a whole-number quantity and provide a reason. Adjustments cannot take stock below zero.

Products at or below their threshold appear in the stock warnings. **Archive** removes a product from future sales while keeping its existing records.

## Record a sale and view its receipt

1. Choose **New sale** or **Record a sale**.
2. Select products and quantities. Check the total.
3. Choose **Cash**, **MTN Mobile Money**, **Airtel Money** or **Credit**.
4. For credit, select an existing customer; add the customer first if necessary.
5. Choose **Save sale**. Stock is deducted when the sale is saved.

Open the sale in **Sales** to view its receipt. **Download receipt** saves a text file. Sales can be searched by receipt or product and filtered by **Today**, **This week** or **All**. This week starts on Monday in Uganda time.

Mobile-money entries record how the customer paid. DukaTrack does not collect or transfer money through MTN or Airtel.

## Customers, credit and repayments

Open **Credit → Add customer** to enter a customer name and optional phone number. Open a customer to see their balance and sales, repayments, returns and refunds. **Edit customer details** corrects contact details without changing the customer's transactions or balance.

When money is received against a debt, choose **Record payment**, select the customer, enter the amount and choose the payment method. A repayment cannot exceed the outstanding balance.

## Returns and reversals

Open the original sale receipt and select **Return or reverse this sale**. Choose the affected items or remaining sale, provide a reason, and check the refund before saving.

The original sale remains in history. Returned quantities go back into stock. Credit owed is reduced; money already received may require a recorded refund. DukaTrack records refunds but does not transfer the money. Use a separate reasoned stock adjustment for damaged goods that should not return to saleable stock.

## Work offline and sync

After you have opened the workspace online, records can be saved on that device while offline. The pending count shows work not yet accepted by the cloud.

When connected again, open **Sync & backup → Sync now**. Wait for the pending count to clear and check the last successful sync time. Sync runs while the app is open. If it says **Sync needs attention**, read the message, reconnect or sign in again, then retry. Retry keeps transaction identities so the same sale is not recorded twice.

Do not clear browser/site data while records are pending. Unsynced records can be lost if the device is lost or its browser storage is removed. Cloud sync and downloaded backups serve different purposes; use both.

### Resolve a conflict

If two devices sell the last stock or make incompatible changes, open **Sync & backup → Needs review**. Inspect the retained transaction, check physical stock and any money received, and make the appropriate replacement or correction record if needed. Record your decision and a reason using **Review**.

Closing a review does not automatically post the rejected sale or move stock. Its evidence and decision remain in resolution history. Restocking does not replay a rejected sale.

## Back up and restore

Choose **Sync & backup → Download business backup** or **Settings → Export backup**. Confirm the JSON file downloaded and keep a private copy outside the device. Exports include saved business records and pending operations.

To restore:

1. Sign in to the original business account.
2. In **Sync & backup**, select the file under **Restore DukaTrack JSON backup**.
3. Review the business name and record counts.
4. Choose **Create safety backup and restore** and keep the downloaded safety file.
5. Reconnect and sync the restored records.

Identical records are skipped. Conflicting existing records block the import rather than being overwritten. Restore adds missing records; it does not rewind a live business to an earlier stock count. Supported imports are at most 400 KB. A safety copy is also saved locally before import; keep the downloaded copy separately.

## Read the dashboard and reports

The dashboard separates sales, cash received, recorded mobile money and outstanding credit. Repayments and refunds affect received-money summaries. **Reports** provides sales revenue, average sale, payment breakdown, current stock levels/value and customer balances. **Export all sales CSV** downloads all sales, including original, returned, net and refunded amounts.

Sales revenue is not profit. Stock value is based on selling prices. Returns reduce revenue against the original sale date; received-money summaries deduct refunds on the refund date.

## Passwords and device lock

- **Change password:** In Settings, enter the current password and the new one. Existing sessions are revoked; sign in again.
- **Forgot password?:** Use the link below the sign-in password field. Enter the registered email and check the inbox/spam folder. Open the reset link, choose and confirm the new password, then sign in. Links expire after 15 minutes and work once. Wait five minutes between requests.
- **Set device lock:** In Settings, create a device passphrase of at least eight characters. It locks the workspace when the tab is hidden, after five minutes of inactivity or when reopened. You can also choose **Lock workspace** in Settings.
- **Forgot device passphrase?:** From the lock screen, sign in online to the same business to remove the device lock.

The device passphrase is separate from the account password. It is a screen privacy lock, not encryption. Use the phone/computer's own screen lock too. Sign out while connected when you finish using a shared device.

## Daily routine

1. Record sales, stock adjustments and repayments as they happen.
2. Check low-stock products and outstanding customer balances.
3. Connect, sync and resolve any records needing review.
4. Download a backup and store it privately outside the device.
5. Check receipts and reports against your actual stock and money.

For technical setup, use [START_HERE.md](START_HERE.md). For the tested release and documented limits, use [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md).
