import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

function toInt(v: string | null, fallback: number) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const waterResourceId = toInt(searchParams.get("waterResourceId"), NaN as any);
  const limit = Math.max(1, Math.min(toInt(searchParams.get("limit"), 5), 5));

  if (!Number.isFinite(waterResourceId)) {
    return NextResponse.json({ ok: false, error: "waterResourceId required" }, { status: 400 });
  }

  const pool = getPool();
  const [rows]: any = await pool.query(
    `SELECT
       ul.id,
       ul.water_resource_id,
       ul.used_at,
       ul.field_name,
       ul.amount,
       ul.note,
       CASE WHEN ul.water_resource_id = ? THEN 1 ELSE 0 END AS is_current_well,
       JSON_UNQUOTE(JSON_EXTRACT(wrs.raw_attributes, '$.cLandLocationDisplay')) AS land_location,
       JSON_UNQUOTE(JSON_EXTRACT(wrs.raw_attributes, '$.WellName')) AS name
     FROM usage_logs ul
     LEFT JOIN water_resources_source wrs
       ON wrs.source_objectid = ul.water_resource_id
      AND wrs.is_deleted = 0
     WHERE ul.is_deleted = 0
     ORDER BY
       CASE WHEN ul.water_resource_id = ? THEN 0 ELSE 1 END,
       ul.used_at DESC
     LIMIT ?`,
    [waterResourceId, waterResourceId, limit]
  );

  return NextResponse.json({ ok: true, data: rows || [] });
}

export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const waterResourceId = toNum(body.waterResourceId);
  const fieldName = String(body.fieldName || "").trim();
  const amount = toNum(body.amount);
  const note = String(body.note || "").trim();

  if (!waterResourceId) {
    return NextResponse.json({ ok: false, error: "waterResourceId required" }, { status: 400 });
  }
  if (!fieldName) {
    return NextResponse.json({ ok: false, error: "fieldName required" }, { status: 400 });
  }
  if (amount == null || amount <= 0) {
    return NextResponse.json({ ok: false, error: "amount must be > 0" }, { status: 400 });
  }

  const pool = getPool();
  const [r]: any = await pool.execute(
    `INSERT INTO usage_logs (water_resource_id, used_at, field_name, amount, note)
     VALUES (?, NOW(), ?, ?, ?)`,
    [waterResourceId, fieldName, amount, note || null]
  );

  return NextResponse.json({ ok: true, id: r.insertId });
}