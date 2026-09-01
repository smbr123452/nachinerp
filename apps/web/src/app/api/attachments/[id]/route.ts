import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readAttachmentForDownload } from "@/server/services/attachments";

/**
 * Хавсралт татах цорын ганц цэг.
 *
 * Аюулгүй байдал:
 *   - Нэвтрээгүй хэрэглэгчид 404 буцаана (401 биш) — ингэснээр ID
 *     байгаа эсэхийг таах боломжгүй.
 *   - Content-Type нь зөвхөн цагаан жагсаалтаас — сервер өөрөө тодорхойлно,
 *     хэрэглэгчийн өгсөн утга ашиглахгүй.
 *   - Content-Disposition нь ҮРГЭЛЖ attachment — HTML/SVG зэрэг агуулга
 *     домэйн дээр гүйцэтгэгдэхээс сэргийлнэ.
 *   - Файлын нэр RFC 5987-оор кодлогдоно — толгойд тэмдэгт тарихаас хамгаална.
 *   - X-Content-Type-Options: nosniff — хөтөч төрлийг таахаас сэргийлнэ.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const attachment = await readAttachmentForDownload(id);
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const asciiName = attachment.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  const encodedName = encodeURIComponent(attachment.fileName);

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.fileSize),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Хувийн мэдээлэл — завсрын кэшэд хадгалахгүй.
      "Cache-Control": "private, no-store",
    },
  });
}
