"use client";

import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { IDLE, type ActionState } from "@/lib/action-state";
import type { ProductType } from "@prisma/client";
import { ALL_UNITS, unitLabel } from "@/lib/units";
import { PRODUCT_TYPE_LABEL, PRODUCT_TYPES } from "@/lib/products";
import { createProductAction, updateProductAction } from "./actions";

export type ProductFormValues = {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  productType: ProductType;
  sellingPrice: string;
  isActive: boolean;
  unit: string;
  minimumStock: string;
  /** Үлдэгдэлтэй эсэх — нэгж ба төрөл солихыг хаана. */
  hasStock: boolean;
  /** Жортой эсэх — RESALE руу шилжихийг хаана. */
  hasRecipe: boolean;
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
  const [productType, setProductType] = useState<ProductType>(initial?.productType ?? "MANUFACTURED");

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  const isResale = productType === "RESALE";
  // Үлдэгдэлтэй бол төрөл солих нь өртгийн эх сурвалжийг эвдэнэ.
  const typeLocked = initial?.hasStock ?? false;

  return (
    <form action={formAction} className="space-y-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Код автоматаар үүсдэг тул зөвхөн харагдана — засах боломжгүй. */}
        <Field label="Код" htmlFor="sku" hint={initial ? undefined : "Хадгалахад автоматаар үүснэ."}>
          <Input id="sku" value={initial?.sku ?? "Автоматаар"} readOnly disabled />
        </Field>
        <Field label="Нэр" htmlFor="name" required error={state.fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={initial?.name} required placeholder="Chicken Pizza" />
        </Field>

        <Field
          label="Төрөл"
          htmlFor="productType"
          required
          error={state.fieldErrors?.productType}
          hint={
            typeLocked
              ? "Үлдэгдэлтэй учир төрлийг солих боломжгүй."
              : isResale
                ? "Худалдаж аваад шууд борлуулна — өөрийн нөөцтэй."
                : "Жороор үйлдвэрлэнэ — орц нь материалаас хасагдана."
          }
        >
          <Select
            id="productType"
            name="productType"
            value={productType}
            disabled={typeLocked}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setProductType(event.target.value as ProductType)
            }
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PRODUCT_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </Field>
        {/* disabled select нь илгээгддэггүй тул утгыг тусад нь дамжуулна. */}
        {typeLocked ? <input type="hidden" name="productType" value={productType} /> : null}

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

        {isResale ? (
          <>
            <Field
              label="Хэмжих нэгж"
              htmlFor="unit"
              required
              error={state.fieldErrors?.unit}
              hint={
                initial?.hasStock
                  ? "Үлдэгдэлтэй учир нэгжийг солих боломжгүй."
                  : "Нөөц ба авалтын өртөг энэ нэгжээр бодогдоно."
              }
            >
              <Select
                id="unit"
                name="unit"
                defaultValue={initial?.unit ?? "PCS"}
                disabled={initial?.hasStock}
              >
                {ALL_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unitLabel(unit)}
                  </option>
                ))}
              </Select>
            </Field>
            {initial?.hasStock ? (
              <input type="hidden" name="unit" value={initial.unit} />
            ) : null}

            <Field
              label="Доод үлдэгдэл"
              htmlFor="minimumStock"
              error={state.fieldErrors?.minimumStock}
              hint="Үүнээс буурвал сэрэмжлүүлнэ. 0 бол хянахгүй."
            >
              <Input
                id="minimumStock"
                name="minimumStock"
                inputMode="decimal"
                defaultValue={initial?.minimumStock ?? "0"}
              />
            </Field>
          </>
        ) : null}

        <div className="flex items-end pb-2">
          <Checkbox label="Идэвхтэй" name="isActive" defaultChecked={initial?.isActive ?? true} />
        </div>
      </div>

      {isResale && initial?.hasRecipe ? (
        <Alert tone="warning">
          Энэ бүтээгдэхүүн жортой байна. Бэлэн бүтээгдэхүүн болгохын өмнө жорыг нь хоослоно уу.
        </Alert>
      ) : null}

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
