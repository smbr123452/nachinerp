import "server-only";
import { AuthenticationError, AuthorizationError } from "@/lib/auth/guards";
import { UnitConversionError } from "@/lib/units";
import { InsufficientStockError } from "@/server/services/inventory";
import { MissingRecipeError, SaleStockShortageError } from "@/server/services/sales";
import { fail, type ActionState } from "@/lib/action-state";

export { IDLE, ok, fail, type ActionState } from "@/lib/action-state";

const KNOWN_ERRORS = [
  AuthenticationError,
  AuthorizationError,
  InsufficientStockError,
  SaleStockShortageError,
  MissingRecipeError,
  UnitConversionError,
];

/**
 * Хүлээгдэж буй алдааг хэрэглэгчид ойлгомжтой мессежээр буцаана.
 * Санамсаргүй алдааг серверийн логт үлдээж, ерөнхий мессеж харуулна.
 */
export function toActionError(error: unknown): ActionState {
  if (error instanceof Error) {
    const isKnown = KNOWN_ERRORS.some((cls) => error instanceof cls);
    if (isKnown) {
      const data = error instanceof SaleStockShortageError ? error.shortages : undefined;
      return fail(error.message, undefined, data);
    }
    // Домэйны шалгалтуудаас гарсан энгийн Error-ууд ч мессежтэй байдаг.
    if (error.name === "Error" && error.message) {
      return fail(error.message);
    }
    console.error("[action]", error);
    return fail("Алдаа гарлаа. Дахин оролдоно уу.");
  }
  console.error("[action]", error);
  return fail("Тодорхойгүй алдаа гарлаа.");
}

/** Prisma-ийн давхардлын алдааг ойлгомжтой болгох. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
