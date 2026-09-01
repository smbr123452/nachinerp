"use client";

import { useActionState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { IDLE, type ActionState } from "@/lib/action-state";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, IDLE);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}

      <Field label="И-мэйл" htmlFor="email" required>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="owner@example.com"
            className="h-10 pl-9"
          />
        </div>
      </Field>

      <Field label="Нууц үг" htmlFor="password" required>
        <div className="relative">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="h-10 pl-9"
          />
        </div>
      </Field>

      <SubmitButton className="mt-1 w-full" size="lg" pendingText="Нэвтэрч байна...">
        Нэвтрэх
      </SubmitButton>
    </form>
  );
}
