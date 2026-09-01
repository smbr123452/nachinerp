"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import { createProductAction, createProductCategoryAction, updateProductAction } from "./actions";

export type ProductFormValues = {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  sellingPrice: string;
  isActive: boolean;
};

type Category = { id: string; name: string };

function ProductForm({
  action,
  initial,
  categories,
  onDone,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ProductFormValues;
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
          <Input id="sku" name="sku" defaultValue={initial?.sku} required placeholder="FP-001" />
        </Field>
        <Field label="Нэр" htmlFor="name" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={initial?.name} required placeholder="Chicken Pizza" />
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
          label="Зарах үнэ (₮)"
          htmlFor="sellingPrice"
          required
          error={state.fieldErrors?.sellingPrice}
        >
          <Input
            id="sellingPrice"
            name="sellingPrice"
            inputMode="decimal"
            defaultValue={initial?.sellingPrice ?? "0"}
            required
          />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox label="Идэвхтэй" name="isActive" defaultChecked={initial?.isActive ?? true} />
        </div>
      </div>

      <ModalActions>
        <Button variant="secondary" onClick={onDone}>
          Болих
        </Button>
        <SubmitButton>Хадгалах</SubmitButton>
      </ModalActions>
    </form>
  );
}

export function NewProductButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={<Plus />} onClick={() => setOpen(true)}>
        Бүтээгдэхүүн нэмэх
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Шинэ бүтээгдэхүүн" size="lg">
        <ProductForm action={createProductAction} categories={categories} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditProductButton({
  product,
  categories,
}: {
  product: ProductFormValues;
  categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Засах
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${product.name} — засах`} size="lg">
        <ProductForm
          action={updateProductAction}
          initial={product}
          categories={categories}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function NewProductCategoryButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createProductCategoryAction, IDLE);

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
          <Field label="Нэр" htmlFor="product-category-name" required error={state.fieldErrors?.name}>
            <Input id="product-category-name" name="name" required placeholder="Пицца" />
          </Field>
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
