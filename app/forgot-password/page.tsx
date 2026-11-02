import type { Metadata } from "next";
import { RecoveryLayout } from "../components/RecoveryLayout";
import { PasswordRecoveryForm } from "../components/PasswordRecoveryForm";

export const metadata: Metadata = { title: "Forgot password | DukaTrack", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <RecoveryLayout title="Forgot password?" description="Enter the email address you use for DukaTrack. We’ll send you instructions to reset your password.">
      <PasswordRecoveryForm step="request" />
    </RecoveryLayout>
  );
}
