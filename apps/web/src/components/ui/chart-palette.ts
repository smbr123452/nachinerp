/**
 * Графикийн ангиллын өнгө.
 *
 * Дараалал ТОГТМОЛ — цуврал нэмэгдэх, хасагдахад өнгө шилжихгүй
 * (өнгө нь эрэмбэ биш, тухайн утгыг илэрхийлнэ).
 * Энэ 4 өнгө нь өнгө ялгагдалтын (CVD) болон энгийн хараанд ялгарах
 * шалгуурыг цагаан дэвсгэр дээр давсан.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

export type SeriesColor = (typeof SERIES_COLORS)[number];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

/** Ганц цувралын график — брэндийн цэнхэр. */
export const SINGLE_SERIES_COLOR = SERIES_COLORS[0];

/** Сүлжээ / тэнхлэгийн туслах өнгө. */
export const AXIS_COLOR = "#e6ebf2";
export const AXIS_TEXT = "#64748b";
