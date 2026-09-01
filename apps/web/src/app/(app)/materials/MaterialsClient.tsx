"use client";

import { useActionState, useEffect, useState } from "react";
import type { Unit } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { ALL_UNITS, unitLabel } from "@/lib/units";
import {
  createMaterialCategoryAction,
  createRawMaterialAction,
  updateRawMaterialAction,
} from "./actions";

export type MaterialFormValues = {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unit: Unit;
  minimumStock: string;
  isActive: boolean;
  hasStock: boolean;
};

type Category = { id: string; name: string };

function MaterialForm({
  action,
  initial,
  categories,
  onDone,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: MaterialFormValues;
  categories: Category[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Код (SKU)" htmlFor="sku" required error={state.fieldErrors?.sku}>
          <Input id="sku" name="sku" defaultValue={initial?.sku} required placeholder="RM-001" />
        </Field>
        <Field label="Нэр" htmlFor="name" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={initial?.name} required placeholder="Гурил" />
        </Field>
        <Field label="Ангилал" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">— Сонгоогүй —</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Хэмжих нэгж"
          htmlFor="unit"
          required
          error={state.fieldErrors?.unit}
          hint={
            initial?.hasStock
              ? "Үлдэгдэлтэй учир нэгжийг солих боломжгүй."
              : "Нөөц, өртөг, жор бүгд энэ нэгжээр бодогдоно."
          }
        >
          <Select id="unit" name="unit" defaultValue={initial?.unit ?? "KG"} disabled={initial?.hasStock}>
            {ALL_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </Select>
          {initial?.hasStock ? <input type="hidden" name="unit" value={initial.unit} /> : null}
        </Field>
        <Field
          label="Доод хэмжээ"
          htmlFor="minimumStock"
          error={state.fieldErrors?.minimumStock}
          hint="Үлдэгдэл энэ түвшнээс доош орвол сануулга өгнө."
        >
          <Input
            id="minimumStock"
            name="minimumStock"
            inputMode="decimal"
            defaultValue={initial?.minimumStock ?? "0"}
          />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox label="Идэвхтэй" name="isActive" defaultChecked={initial?.isActive ?? true} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Болих
        </Button>
        <SubmitButton>Хадгалах</SubmitButton>
      </div>
    </form>
  );
}

export function NewMaterialButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Материал нэмэх</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Шинэ бараа материал" wide>
        <MaterialForm
          action={createRawMaterialAction}
          categories={categories}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function EditMaterialButton({
  material,
  categories,
}: {
  material: MaterialFormValues;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Засах
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${material.name} — засах`} wide>
        <MaterialForm
          action={updateRawMaterialAction}
          initial={material}
          categories={categories}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function NewCategoryButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createMaterialCategoryAction, IDLE);

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ангилал нэмэх
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Шинэ ангилал">
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}
          <Field label="Нэр" htmlFor="category-name" required error={state.fieldErrors?.name}>
            <Input id="category-name" name="name" required placeholder="Гурилан бүтээгдэхүүн" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <SubmitButton>Хадгалах</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
