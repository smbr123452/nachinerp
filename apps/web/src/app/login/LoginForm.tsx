"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { IDLE, type ActionState } from "@/lib/action-state";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, IDLE);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Field label="И-мэйл" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="owner@example.com"
        />
      </Field>

      <Field label="Нууц үг" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton className="w-full" size="lg" pendingText="Нэвтэрч байна...">
        Нэвтрэх
      </SubmitButton>
    </form>
  );
}
