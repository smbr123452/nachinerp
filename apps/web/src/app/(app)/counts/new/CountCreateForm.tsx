"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { IDLE, type ActionState } from "@/lib/action-state";
import { formatQty } from "@/lib/format";
import { createCountAction } from "../actions";

export type CountMaterial = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: string;
  unit: string;
};

export function CountCreateForm({ materials, today }: { materials: CountMaterial[]; today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createCountAction, IDLE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(materials.map((m) => m.id)));

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return materials;
    return materials.filter(
      (m) => m.name.toLowerCase().includes(query) || m.sku.toLowerCase().includes(query),
    );
  }, [materials, search]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardHeader title="Тооллогын мэдээлэл" />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Огноо" htmlFor="count-date" required error={state.fieldErrors?.date}>
              <Input id="count-date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Тайлбар" htmlFor="count-note">
              <Input id="count-note" name="note" placeholder="Жишээ: сарын эцсийн тооллого" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Тоолох материал"
          description={`${selected.size} / ${materials.length} сонгогдсон`}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(materials.map((m) => m.id)))}>
                Бүгдийг сонгох
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                Цэвэрлэх
              </Button>
            </div>
          }
        />
        <CardBody>
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Материал хайх..."
            className="mb-4"
          />
          <div className="grid max-h-96 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((material) => (
              <label
                key={material.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="rawMaterialIds"
                  value={material.id}
                  checked={selected.has(material.id)}
                  onChange={() => toggle(material.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="min-w-0 flex-1 truncate">
                  {material.name}
                  <span className="ml-1 text-xs text-slate-400">
                    {formatQty(material.quantity)} {material.unit}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg" disabled={selected.size === 0} pendingText="Үүсгэж байна...">
          Тооллого эхлүүлэх
        </SubmitButton>
      </div>
    </form>
  );
}
