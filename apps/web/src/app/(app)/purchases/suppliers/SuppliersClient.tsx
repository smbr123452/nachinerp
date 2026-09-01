"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createSupplierAction, updateSupplierAction } from "./actions";
import { SupplierForm, type SupplierFormValues } from "./SupplierForm";

export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button icon={<Plus />} onClick={() => setOpen(true)}>
        Шинэ нийлүүлэгч
      </Button>
      <Modal open={open} onClose={close} title="Шинэ нийлүүлэгч" size="lg">
        <SupplierForm action={createSupplierAction} onDone={close} />
      </Modal>
    </>
  );
}

export function EditSupplierButton({
  supplier,
  label = "Засах",
  variant = "secondary",
}: {
  supplier: SupplierFormValues;
  label?: string;
  variant?: "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button variant={variant} size={variant === "ghost" ? "sm" : "md"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={close} title={`${supplier.name} — засах`} size="lg">
        <SupplierForm action={updateSupplierAction} initial={supplier} onDone={close} />
      </Modal>
    </>
  );
}
