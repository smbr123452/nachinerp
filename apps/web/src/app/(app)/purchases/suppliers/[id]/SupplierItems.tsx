"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/ui/SearchableCombobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { EmptyRow, Table, TableLink, Td, Th, Tr } from "@/components/ui/Table";
import { IDLE, type ActionState } from "@/lib/action-state";
import { addSupplierItemAction, removeSupplierItemAction } from "../actions";

export type EligibleItem = {
  key: string;
  kind: "rawMaterial" | "product";
  name: string;
  sku: string;
};

export type SupplierItemView = {
  id: string;
  key: string;
  name: string;
  sku: string;
  kind: "rawMaterial" | "product";
  isActive: boolean;
  /** Батлагдсан худалдан авалтын түүхээс. Хэзээ ч аваагүй бол null. */
  lastPrice: string | null;
  lastDate: string | null;
  lastPurchaseId: string | null;
  lastPurchaseNo: string | null;
};

const KIND_LABEL: Record<EligibleItem["kind"], string> = {
  rawMaterial: "Түүхий эд",
  product: "Бэлэн бүтээгдэхүүн",
};

/**
 * "Авагддаг бараа" — нийлүүлэгчтэй холбогдсон бараанууд.
 *
 * Энэ нь ХЭВШИЛ бүртгэх хэсэг: бараа нэмэх нь худалдан авалт үүсгэхгүй,
 * нөөц ч хөдлөхгүй. Сүүлийн үнэ, огноо нь тусад нь батлагдсан худалдан
 * авалтын түүхээс бодогдож ирнэ.
 */
export function SupplierItems({
  supplierId,
  items,
  eligible,
}: {
  supplierId: string;
  items: SupplierItemView[];
  eligible: EligibleItem[];
}) {
  const [adding, setAdding] = useState(false);
  // Тогтвортой лавлагаа — эффектийн хамаарал бүр render-д өөрчлөгдөхгүй.
  const closeAdd = useCallback(() => setAdding(false), []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-6 text-ink-900">Авагддаг бараа</h3>
          <p className="mt-1 text-[13px] leading-5 text-ink-500">
            Энэ нийлүүлэгчээс ихэвчлэн авдаг бараа. Үнэ нь батлагдсан худалдан авалтын
            түүхээс гарна — энд үнэ хадгалахгүй.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<Plus />}
          onClick={() => setAdding(true)}
          disabled={eligible.length === 0}
          title={eligible.length === 0 ? "Нэмэх боломжтой бараа алга байна." : undefined}
        >
          Бараа нэмэх
        </Button>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Бараа</Th>
            <Th>Төрөл</Th>
            <Th align="right">Сүүлийн авсан үнэ</Th>
            <Th>Сүүлийн авсан огноо</Th>
            {/* Үйлдлийн багана нь хүснэгт хэвтээ гүйхэд ч баруун ирмэгт
                наалдаж, ҮРГЭЛЖ харагдана. Нарийн дэлгэц эсвэл томруулсан
                хөтөч дээр товч харагдахгүй болох асуудлыг зогсооно. */}
            <Th align="right" stickyRight />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow colSpan={5}>Бараа холбогдоогүй байна.</EmptyRow>
          ) : (
            items.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <span className="font-medium text-ink-900">{item.name}</span>
                  <span className="ml-2 text-[13px] text-ink-500">{item.sku}</span>
                  {!item.isActive ? (
                    <Badge tone="neutral" className="ml-2">
                      Идэвхгүй
                    </Badge>
                  ) : null}
                </Td>
                <Td className="text-ink-500">{KIND_LABEL[item.kind]}</Td>
                <Td align="right" className={item.lastPrice ? "font-medium" : "text-ink-500"}>
                  {item.lastPrice ?? "—"}
                </Td>
                <Td className="text-ink-500">
                  {item.lastDate ? (
                    <>
                      {item.lastDate}
                      {item.lastPurchaseId ? (
                        <>
                          {" · "}
                          <TableLink href={`/purchases/${item.lastPurchaseId}`}>
                            {item.lastPurchaseNo}
                          </TableLink>
                        </>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right" stickyRight>
                  <RemoveItemButton item={item} />
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>

      {/* Формыг Modal-ын ДОТОР байрлуулна: хаагдахад бүрэлдэхүүн хэсэг нь
          салж, useActionState нь IDLE рүү шинэчлэгддэг. Modal-ыг гаднаас нь
          боож байвал өмнөх амжилтын төлөв наалдаж, дахин нээхэд шууд хаагдана. */}
      <Modal
        open={adding}
        onClose={closeAdd}
        title="Бараа нэмэх"
        description="Зөвхөн идэвхтэй түүхий эд ба бэлэн бүтээгдэхүүн сонгогдоно. Тоо хэмжээ, үнэ шаардлагагүй."
      >
        <AddItemForm supplierId={supplierId} eligible={eligible} onDone={closeAdd} />
      </Modal>
    </>
  );
}

/**
 * Бараа холбох форм.
 *
 * Modal-ын ДОТОР render хийгддэг тул хаагдахад бүхэлдээ салж, дараагийн
 * удаа шинэ, цэвэр төлөвтэйгээр нээгдэнэ.
 */
function AddItemForm({
  supplierId,
  eligible,
  onDone,
}: {
  supplierId: string;
  eligible: EligibleItem[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(addSupplierItemAction, IDLE);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  // Сонгох боломжтой барааны хүрээ ӨӨРЧЛӨГДӨӨГҮЙ — `eligible` нь өмнөх
  // шигээ сервер талаас ирнэ. Зөвхөн сонгох арга нь хайлттай боллоо.
  const options: ComboboxOption[] = useMemo(
    () =>
      eligible.map((item) => ({
        value: item.key,
        label: item.name,
        secondary: item.sku,
        group: item.kind === "rawMaterial" ? "Түүхий эд" : "Бэлэн бүтээгдэхүүн",
        badge: item.kind === "rawMaterial" ? "Түүхий эд" : "Бэлэн бүтээгдэхүүн",
      })),
    [eligible],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="supplierId" value={supplierId} />
      {state.status === "error" && state.message ? (
        <Alert tone="error">{state.message}</Alert>
      ) : null}

      <Field label="Бараа" htmlFor="itemKey" required>
        <SearchableCombobox
          id="itemKey"
          name="itemKey"
          required
          value={selected}
          onChange={setSelected}
          options={options}
          placeholder="Бараа хайх эсвэл сонгох..."
          searchPlaceholder="Нэр эсвэл код..."
          emptyMessage="Хайлтад тохирох бараа алга байна."
        />
      </Field>

      <ModalActions>
        <Button variant="secondary" onClick={onDone}>
          Болих
        </Button>
        <SubmitButton disabled={!selected}>Нэмэх</SubmitButton>
      </ModalActions>
    </form>
  );
}

function RemoveItemButton({ item }: { item: SupplierItemView }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(removeSupplierItemAction, IDLE);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 />}
        onClick={() => setOpen(true)}
        className="text-ink-500 hover:bg-red-50 hover:text-red-700"
      >
        Салгах
      </Button>
      {state.status === "error" && state.message ? (
        <Alert tone="error" className="mt-2">
          {state.message}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Холбоос салгах"
        description={`"${item.name}"-г энэ нийлүүлэгчээс салгах уу? Зөвхөн сонголт устана — худалдан авалтын түүх, үнэ, нөөц хэвээр үлдэнэ.`}
        confirmLabel="Салгах"
        hiddenFields={{ supplierItemId: item.id }}
        action={(formData) => {
          setOpen(false);
          formAction(formData);
        }}
      />
    </>
  );
}
