/**
 * Server action-ийн хариу. Клиент болон сервер хоёулаа ашиглана —
 * тиймээс энэ файл ямар ч сервер талын модуль импортлохгүй.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Нэмэлт өгөгдөл (жишээ: нөөцийн дутагдлын жагсаалт). */
  data?: unknown;
};

export const IDLE: ActionState = { status: "idle" };

export function ok(message?: string, data?: unknown): ActionState {
  return { status: "success", message, data };
}

export function fail(
  message: string,
  fieldErrors?: Record<string, string[]>,
  data?: unknown,
): ActionState {
  return { status: "error", message, fieldErrors, data };
}
