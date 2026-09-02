import { SiriusAurumLogo } from "./SiriusAurumLogo";

/**
 * Хэвтээ брэнд блок: [албан ёсны лого] SIRIUS AURUM / ERP.
 *
 * Лого нь эх PNG хэвээрээ — текстэд тааруулж өөрчлөхгүй, зөвхөн хэмжээг нь өгнө.
 */

const BRAND_NAME = "SIRIUS AURUM";
const PRODUCT = "ERP";

const SIZES = {
  sm: { logo: 34, source: 128, name: "text-[13.5px] leading-[18px]", product: "text-[10px] leading-[13px]", gap: "gap-2.5" },
  md: { logo: 44, source: 128, name: "text-[15px] leading-5", product: "text-[11px] leading-[14px]", gap: "gap-3" },
  lg: { logo: 64, source: 256, name: "text-[19px] leading-6", product: "text-[12px] leading-4", gap: "gap-3.5" },
} as const;

type Props = {
  size?: keyof typeof SIZES;
  /** Цайвар дэвсгэр дээр хар бичвэр, брэнд өнгийн дэвсгэр дээр цагаан бичвэр. */
  tone?: "onLight" | "onBrand";
  className?: string;
};

export function SiriusAurumLockup({ size = "md", tone = "onLight", className }: Props) {
  const s = SIZES[size];
  const onBrand = tone === "onBrand";

  return (
    <span className={`flex items-center ${s.gap} ${className ?? ""}`}>
      <SiriusAurumLogo size={s.logo} source={s.source} />
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
