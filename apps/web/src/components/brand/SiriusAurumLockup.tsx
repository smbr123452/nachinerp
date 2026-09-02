import { SiriusAurumMark } from "./SiriusAurumMark";

/**
 * Хэвтээ брэнд блок: [SA тэмдэг] SIRIUS AURUM / ERP.
 *
 * Тэмдгийг текстэд тааруулж сунгах, шахах зэргээр өөрчлөхгүй — зөвхөн
 * өндрийг нь тохируулна. Бичвэр Inter-ээр, товч бөгөөд байгууллагын хэв маягтай.
 */

const BRAND_NAME = "SIRIUS AURUM";
const PRODUCT = "ERP";

const SIZES = {
  sm: { mark: "h-[22px]", name: "text-[13.5px] leading-[18px]", product: "text-[10px] leading-[13px]", gap: "gap-2.5" },
  md: { mark: "h-7", name: "text-[15px] leading-5", product: "text-[11px] leading-[14px]", gap: "gap-3" },
  lg: { mark: "h-10", name: "text-[19px] leading-6", product: "text-[12px] leading-4", gap: "gap-3.5" },
} as const;

type Props = {
  size?: keyof typeof SIZES;
  /** Цайвар дэвсгэр дээр хар бичвэр, брэнд өнгийн дэвсгэр дээр цагаан бичвэр. */
  tone?: "onLight" | "onBrand";
  /** Цэнхэр дэвсгэр дээр тэмдгийг цагаан дэвсгэр дээр тавьж тодруулна. */
  plated?: boolean;
  className?: string;
};

export function SiriusAurumLockup({
  size = "md",
  tone = "onLight",
  plated = false,
  className,
}: Props) {
  const s = SIZES[size];
  const onBrand = tone === "onBrand";

  const mark = <SiriusAurumMark className={s.mark} />;

  return (
    <span className={`flex items-center ${s.gap} ${className ?? ""}`}>
      {plated ? (
        <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-sm">
          {mark}
        </span>
      ) : (
        mark
      )}

      <span className="min-w-0">
        <span
          className={`block truncate font-semibold tracking-[0.045em] ${s.name} ${
            onBrand ? "text-white" : "text-ink-900"
          }`}
        >
          {BRAND_NAME}
        </span>
        <span
          className={`block font-medium uppercase tracking-[0.22em] ${s.product} ${
            onBrand ? "text-brand-100" : "text-ink-500"
          }`}
        >
          {PRODUCT}
        </span>
      </span>
    </span>
  );
}
