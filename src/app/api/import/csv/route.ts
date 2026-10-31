import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/tenancy/guard";
import { CSV_MAX_BYTES, CsvImportError, importCsv } from "@/lib/import/csv";
import { z } from "zod";
import { BillingLimitError, denialBody } from "@/lib/billing/entitlements";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  // Importing a customer ledger is an operator action inside one workspace.
  const auth = await requireMember(request, { mutation: true });
  if (!auth.ok) return auth.response;
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
    // The destination workspace is the signed-in one; a businessId in the query
    // string is ignored so a member cannot write into another tenant's ledger.
    return NextResponse.json(
      await importCsv(text, auth.businessId, {
        attestedByUserId: auth.session.user.id,
      }),
    );
  } catch (error) {
    if (error instanceof BillingLimitError)
      return NextResponse.json(denialBody(error.denial), { status: 402 });
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
