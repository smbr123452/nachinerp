"use client";

import { useId } from "react";

/**
 * SIRIUS AURUM-ын албан ёсны "SA" тэмдэг.
 *
 * Батлагдсан лого — геометр, өнгө, градиентын чиглэлийг өөрчлөхгүй.
 * Дэвсгэр нь тунгалаг тул цагаан, цайвар саарал дээр шууд тавина. Гүн цэнхэр
 * дэвсгэр дээр тодрол хүрэхгүй тул цагаан товруун дээр (SiriusAurumLockup-ын
 * `plated`) байрлуулна. Харьцаа нь 990 × 640 (≈1.547:1).
 */

type Props = {
  /** Зөвхөн өндрийг өгнө, ж: "h-6". Өргөн нь харьцаанаас гарна. */
  className?: string;
  /** Гарчиг байхгүй үед дэлгэц уншигчид тэмдгийг чимэглэл гэж үзнэ. */
  title?: string;
};

export function SiriusAurumMark({ className, title }: Props) {
  // Тэмдэг нэг хуудсанд хэд хэдэн удаа гарч болно (ж: цэсний гурван хувилбар).
  // Давхардсан id үед хөтөч эхний тохиолдлыг сонгодог тул нуугдсан SVG-ийн
  // градиент ашиглагдаж, харагдах тэмдэг будаггүй болно. Тиймээс id бүр давтагдахгүй.
  const rampId = useId();

  return (
    <svg
      viewBox="0 0 990 640"
      /* Дотоод хэмжээ. Үүнгүй бол flex дотор өргөн нь 0 болж тэмдэг тасарна —
         дуудагч нь зөвхөн өндрийг өгөхөд өргөн нь харьцаагаар гарна. */
      width={990}
      height={640}
      className={`w-auto shrink-0 ${className ?? ""}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={rampId} gradientUnits="userSpaceOnUse" x1="800" y1="0" x2="330" y2="640">
          <stop offset="0" stopColor="#12A6F6" />
          <stop offset="0.34" stopColor="#1D7AF0" />
          <stop offset="0.7" stopColor="#2058E9" />
          <stop offset="1" stopColor="#1B45DA" />
        </linearGradient>
      </defs>

      {/* "S" туузан хэлбэр + "A" сум. Хоёулаа нэг градиентыг хуваалцана. */}
      <g fill={`url(#${rampId})`}>
        <path d="M655,0 L990,640 L785,640 L655,285 L550,640 L490,640 Z" />
        <path
          fill="none"
          stroke={`url(#${rampId})`}
          strokeWidth="145"
          strokeLinecap="butt"
          strokeLinejoin="round"
          d="M560,72 L255,72 C138,72 34,142 34,236 C34,332 122,380 244,404 C338,423 420,444 420,502 C420,556 358,568 280,568 L45,568"
        />
        {/* "S"-ийн ташуу төгсгөлүүд. Туузыг давхарлаж таарсан тул зураас гарахгүй. */}
        <path d="M548,0 L600,0 L548,145 Z" />
        <path d="M57,495 L57,640 L0,640 Z" />
      </g>

      {/* Sirius-ийн дөрвөн хошуут од — "A"-ийн дотор талд суусан хар хөх. */}
      <path
        fill="#16244C"
        d="M652,376 C662,462 676,492 730,515 C676,538 662,568 652,640 C642,568 628,538 574,515 C628,492 642,462 652,376 Z"
      />
    </svg>
  );
}
