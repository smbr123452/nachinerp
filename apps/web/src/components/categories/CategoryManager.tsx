"use client";

import { useEffect, useState, useActionState, type ChangeEvent } from "react";
import { Pencil, Plus, RotateCcw, Trash2, EyeOff } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { ActiveBadge } from "@/components/ui/Badge";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  setCategoryActiveAction,
} from "@/app/(app)/categories-actions";

export type CategoryKind = "rawMaterial" | "product";

export type CategoryRow = {
  id: string;
  name: string;
  isActive: boolean;
  usageCount: number;
};

/**
 * Ангиллын удирдлагын модал.
 *
 * canDelete нь ЗӨВХӨН харагдацын хувьд товчийг нуух зорилготой —
 * жинхэнэ хамгаалалт нь серверийн requireOwner() дээр байдаг.
 */
export function CategoryManagerButton({
  kind,
  categories,
  canDelete,
  label = "Ангилал",
}: {
  kind: CategoryKind;
  categories: CategoryRow[];
  canDelete: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ангилал удирдах"
        description="Ашиглагдаж буй ангиллыг устгах боломжгүй — идэвхгүй болгоно уу."
        size="lg"
      >
        <CategoryManagerBody kind={kind} categories={categories} canDelete={canDelete} />
      </Modal>
    </>
  );
}

function CategoryManagerBody({
  kind,
  categories,
  canDelete,
}: {
  kind: CategoryKind;
  categories: CategoryRow[];
  canDelete: boolean;
}) {
  return (
    <div className="space-y-5">
      <CreateForm kind={kind} />

      <div className="divide-y divide-ink-200 rounded-lg border border-ink-200">
        {categories.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-500">
            Ангилал бүртгэгдээгүй байна.
          </p>
        ) : (
          categories.map((category) => (
            <CategoryLine
              key={category.id}
              kind={kind}
              category={category}
              canDelete={canDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CreateForm({ kind }: { kind: CategoryKind }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createCategoryAction, IDLE);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (state.status === "success") setValue("");
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      {state.status === "error" && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}
      <Field label="Шинэ ангилал" htmlFor="new-category" error={state.fieldErrors?.name}>
        <div className="flex flex-wrap gap-2">
          <Input
            id="new-category"
            name="name"
            required
            value={value}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
            placeholder="Гурилан бүтээгдэхүүн"
            className="min-w-0 flex-1"
          />
          <SubmitButton icon={<Plus />}>Нэмэх</SubmitButton>
        </div>
      </Field>
    </form>
  );
}

function CategoryLine({
  kind,
  category,
  canDelete,
}: {
  kind: CategoryKind;
  category: CategoryRow;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [renameState, renameAction] = useActionState<ActionState, FormData>(
    renameCategoryAction,
    IDLE,
  );
  const [activeState, activeAction] = useActionState<ActionState, FormData>(
    setCategoryActiveAction,
    IDLE,
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteCategoryAction,
    IDLE,
  );

  useEffect(() => {
    if (renameState.status === "success") setEditing(false);
  }, [renameState]);

  const inUse = category.usageCount > 0;
  const error =
    (renameState.status === "error" && renameState.message) ||
    (activeState.status === "error" && activeState.message) ||
    (deleteState.status === "error" && deleteState.message) ||
    null;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {editing ? (
          <form action={renameAction} className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={category.id} />
            <Input
              name="name"
              required
              defaultValue={category.name}
              aria-label="Ангиллын нэр"
              className="min-w-0 flex-1"
            />
            <SubmitButton size="sm">Хадгалах</SubmitButton>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Болих
            </Button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
              {category.name}
            </span>
            <ActiveBadge active={category.isActive} />
            <span className="text-[13px] tabular-nums text-ink-500">
              {category.usageCount} бичлэг
            </span>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil />}
                onClick={() => setEditing(true)}
              >
                Нэр
              </Button>

              <form action={activeAction} className="inline-flex">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="isActive" value={String(!category.isActive)} />
                <SubmitButton
                  size="sm"
                  variant="ghost"
                  icon={category.isActive ? <EyeOff /> : <RotateCcw />}
                >
                  {category.isActive ? "Идэвхгүй" : "Сэргээх"}
                </SubmitButton>
              </form>

              {canDelete ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={inUse}
                  title={
                    inUse
                      ? "Ашиглагдаж буй ангиллыг устгах боломжгүй."
                      : "Бүр мөсөн устгах"
                  }
                  onClick={() => setConfirming(true)}
                  className={inUse ? undefined : "text-red-600 hover:bg-red-50 hover:text-red-700"}
                >
                  Устгах
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {error ? (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Ангилал бүр мөсөн устгах"
        description={`"${category.name}" ангиллыг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`}
        confirmLabel="Устгах"
        hiddenFields={{ kind, id: category.id }}
        action={(formData) => {
          setConfirming(false);
          deleteAction(formData);
        }}
      />
    </div>
  );
}
