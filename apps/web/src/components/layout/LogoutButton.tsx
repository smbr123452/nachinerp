import { logoutAction } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/ui/Button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton variant="secondary" size="sm" pendingText="Гарч байна...">
        Гарах
      </SubmitButton>
    </form>
  );
}
