/**
 * SIRIUS AURUM-ын албан ёсны лого.
 *
 * Эх сурвалж: `public/brand/sirius-aurum-logo.png` (1254×1254).
 * Энэ файл нь ганц эх бөгөөд лого дахин зурагдаагүй, өөрчлөгдөөгүй.
 * Жижиг хэмжээсүүд нь мөнөөх файлаас Lanczos аргаар шууд багасгаж гаргасан.
 *
 * Дүрсийг сунгах, тайрах, өнгө солих, одыг шилжүүлэх зэрэг өөрчлөлт хийхгүй —
 * дуудагч зөвхөн харагдах хэмжээг өгнө. Эх зураг дөрвөлжин (1:1) тул
 * өндөр, өргөн нь тэнцүү байна.
 */

/** Дэлгэц дээрх хэмжээ бүрд 2× нягтралтай файлыг сонгоно. */
const SOURCES = {
  128: "/brand/sirius-aurum-logo-128.png",
  256: "/brand/sirius-aurum-logo-256.png",
} as const;

type Props = {
  /** Дэлгэц дээрх талын хэмжээ, пиксэлээр (зураг дөрвөлжин). */
  size: number;
  /** 2× файл сонгоход ашиглана. */
  source?: keyof typeof SOURCES;
  className?: string;
  /** Хажууд нь брэндийн нэр бичигдсэн үед зургийг чимэглэл гэж үзнэ. */
  alt?: string;
};

export function SiriusAurumLogo({ size, source = 128, className, alt }: Props) {
  // next/image ашиглавал ажиллах үедээ дахин кодлогдож, өнгө/пиксэл өөрчлөгдөх
  // эрсдэлтэй. Албан ёсны логог яг байгаагаар нь үзүүлэхийн тулд урьдчилан
  // багасгасан PNG-г шууд тавина.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SOURCES[source]}
      width={size}
      height={size}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      decoding="async"
      className={`shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
