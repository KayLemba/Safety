import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "tactivo-safety-next", database: "postgresql via /api/health" });
}

