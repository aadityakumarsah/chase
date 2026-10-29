import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { verifySession } from "@/lib/auth";
import {
  CSV_MAX_BYTES,
  CsvImportError,
  importCsv,
  resolveImportBusiness,
} from "@/lib/import/csv";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!verifySession(request.cookies.get("admin")?.value, env.ADMIN_PASSCODE))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(env.APP_BASE_URL).origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > CSV_MAX_BYTES + 16384)
      return NextResponse.json(
        { error: "CSV exceeds 2 MiB limit" },
        { status: 413 },
      );
    const type = request.headers.get("content-type") ?? "";
    let text: string;
    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > CSV_MAX_BYTES)
        return NextResponse.json(
          { error: "Upload a CSV file under 2 MiB" },
          { status: 400 },
        );
      text = await file.text();
    } else if (type.startsWith("text/csv") || type.startsWith("text/plain"))
      text = await request.text();
    else
      return NextResponse.json(
        { error: "Use text/csv or multipart/form-data with a file field" },
        { status: 415 },
      );
    if (Buffer.byteLength(text) > CSV_MAX_BYTES)
      return NextResponse.json(
        { error: "CSV exceeds 2 MiB limit" },
        { status: 413 },
      );
    const businessId = await resolveImportBusiness(
      request.nextUrl.searchParams.get("businessId") ?? undefined,
    );
    return NextResponse.json(await importCsv(text, businessId));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CsvImportError
            ? error.message
            : error instanceof z.ZodError
              ? "Invalid businessId"
              : "CSV import unavailable; check database and migrations",
      },
      {
        status:
          error instanceof CsvImportError || error instanceof z.ZodError
            ? 400
            : 503,
      },
    );
  }
}
