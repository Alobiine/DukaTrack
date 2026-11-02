import type { Metadata } from "next";
import { RecoveryLayout } from "../components/RecoveryLayout";
import { PasswordRecoveryForm } from "../components/PasswordRecoveryForm";

export const metadata: Metadata = { title: "Reset password | DukaTrack", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <RecoveryLayout title="Set a new password" description="Choose a new password for your DukaTrack account. Password reset links expire after 15 minutes.">
      <PasswordRecoveryForm step="reset" />
    </RecoveryLayout>
  );
}
