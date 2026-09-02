import type { MovementType } from "@prisma/client";

/** Гар тохируулгад зөвшөөрөгдөх хөдөлгөөний төрлүүд. */
export const MANUAL_MOVEMENT_TYPES = [
  "MANUAL_ADJUSTMENT_IN",
  "MANUAL_ADJUSTMENT_OUT",
  "WASTE_OUT",
  "RETURN_IN",
  "INTERNAL_USE_OUT",
] as const satisfies readonly MovementType[];

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE_IN: "Худалдан авалт — орлого",
  SALE_CONSUMPTION_OUT: "Борлуулалтын хэрэглээ",
  MANUAL_ADJUSTMENT_IN: "Гар тохируулга — нэмэх",
  MANUAL_ADJUSTMENT_OUT: "Гар тохируулга — хасах",
  INVENTORY_COUNT_GAIN: "Тооллого — илүү",
  INVENTORY_COUNT_LOSS: "Тооллого — дутуу",
  WASTE_OUT: "Хаягдал",
  RETURN_IN: "Буцаалт — орлого",
  INTERNAL_USE_OUT: "Дотоод хэрэглээ",
  CORRECTION_IN: "Залруулга — орлого",
  CORRECTION_OUT: "Залруулга — зарлага",
  WRITE_OFF_OUT: "Акт — хасалт",
  WRITE_OFF_REVERSAL_IN: "Акт буцаалт — сэргээлт",
};
