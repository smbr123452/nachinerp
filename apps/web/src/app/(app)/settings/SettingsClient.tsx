"use client";

import { useActionState, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createUserAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button icon={<Plus />} onClick={() => setOpen(true)}>
        Хэрэглэгч нэмэх
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Шинэ хэрэглэгч" size="lg">
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="И-мэйл" htmlFor="user-email" required error={state.fieldErrors?.email}>
              <Input id="user-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Нэр" htmlFor="user-name" required error={state.fieldErrors?.name}>
              <Input id="user-name" name="name" required />
            </Field>
            <Field label="Эрх" htmlFor="user-role" required>
              <Select id="user-role" name="role" defaultValue="MANAGER">
                <option value="MANAGER">Менежер</option>
                <option value="OWNER">Эзэн</option>
              </Select>
            </Field>
            <Field
              label="Нууц үг"
              htmlFor="user-password"
              required
              error={state.fieldErrors?.password}
              hint="8-аас доошгүй тэмдэгт"
            >
              <Input id="user-password" name="password" type="password" required autoComplete="new-password" />
            </Field>
          </div>
          <ModalActions>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton>Хадгалах</SubmitButton>
          </ModalActions>
        </form>
      </Modal>
    </>
  );
}

export function EditUserButton({
  user,
}: {
  user: { id: string; name: string; email: string; role: Role; isActive: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [updateState, updateAction] = useActionState<ActionState, FormData>(updateUserAction, IDLE);
  const [passwordState, passwordAction] = useActionState<ActionState, FormData>(resetPasswordAction, IDLE);

  useEffect(() => {
    if (updateState.status === "success") setOpen(false);
  }, [updateState]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Засах
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${user.name} — засах`} description={user.email} size="lg">
        <div className="space-y-6">
          <form action={updateAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            {updateState.status === "error" && updateState.message ? (
              <Alert tone="error">{updateState.message}</Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Нэр" htmlFor="edit-name" required error={updateState.fieldErrors?.name}>
                <Input id="edit-name" name="name" defaultValue={user.name} required />
              </Field>
              <Field label="Эрх" htmlFor="edit-role" required>
                <Select id="edit-role" name="role" defaultValue={user.role}>
                  <option value="MANAGER">Менежер</option>
                  <option value="OWNER">Эзэн</option>
                </Select>
              </Field>
            </div>
            <Checkbox label="Идэвхтэй" name="isActive" defaultChecked={user.isActive} />
            <ModalActions>
              <SubmitButton>Хадгалах</SubmitButton>
            </ModalActions>
          </form>

          <div className="border-t border-ink-200 pt-4">
            <form action={passwordAction} className="space-y-4">
              <input type="hidden" name="id" value={user.id} />
              {passwordState.status === "error" && passwordState.message ? (
                <Alert tone="error">{passwordState.message}</Alert>
              ) : null}
              {passwordState.status === "success" && passwordState.message ? (
                <Alert tone="success">{passwordState.message}</Alert>
              ) : null}
              <Field
                label="Шинэ нууц үг"
                htmlFor="edit-password"
                error={passwordState.fieldErrors?.password}
                hint="Солиход тухайн хэрэглэгчийн нээлттэй сешн хаагдана."
              >
                <Input id="edit-password" name="password" type="password" autoComplete="new-password" />
              </Field>
              <ModalActions>
                <SubmitButton variant="secondary">Нууц үг солих</SubmitButton>
              </ModalActions>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}
