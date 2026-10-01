// CarbuScope — T54-Ca — GET /api/hubs/clients/export : export CSV de la base
// clients TMP avec les FILTRES COURANTS (hubId / q / segment — mêmes règles
// que la liste). Pattern T52-R2b : BOM UTF-8, séparateur « ; », virgules
// décimales, dates FR jj/mm/aaaa — ouverture directe dans Excel FR.
// En-têtes FR : Plaque ; Client ; Téléphone ; Véhicule ; Type ; Segment ;
// Hub ; Visites ; Dernière visite ; CA cumulé estimé (DT).
// Session requise (données personnelles clients — 401 sinon).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  VEHICLE_SEGMENTS,
  estimatedRevenueByVehicle,
  jsonError,
  normalizeFr,
  requireHubSession,
} from "../../_lib"

export const dynamic = "force-dynamic"

/** Échappe une valeur CSV (« ; » / « " » / retour ligne → quotes doubles). */
function esc(v: string | number | null): string {
  const s = v === null ? "" : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Date FR jj/mm/aaaa. */
function dateFr(d: Date | null): string {
  if (!d) return ""
  return new Intl.DateTimeFormat("fr-FR").format(d)
}

/** Nombre décimal FR (virgule) — CA cumulé estimé en DT. */
function decFr(v: number): string {
  return v.toFixed(2).replace(".", ",")
}

export async function GET(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const hubId = req.nextUrl.searchParams.get("hubId")?.trim() ?? ""
  const q = normalizeFr(req.nextUrl.searchParams.get("q")?.trim() ?? "")
  const segment = req.nextUrl.searchParams.get("segment")?.trim() ?? ""

  if (segment && !VEHICLE_SEGMENTS.includes(segment)) {
    return jsonError("Segment inconnu (fidèle, régulier ou nouveau).", 400)
  }
  if (hubId) {
    const hub = await db.mobilityHub.findUnique({ where: { id: hubId }, select: { id: true } })
    if (!hub) {
      return jsonError("Terminal Multi-Services introuvable.", 404)
    }
  }

  const rows = await db.hubVehicle.findMany({
    where: {
      ...(hubId ? { hubId } : {}),
      ...(segment ? { segment } : {}),
    },
    include: { hub: { select: { code: true, name: true } } },
    orderBy: [{ plate: "asc" }],
  })

  const filtered = q
    ? rows.filter(v =>
        normalizeFr(`${v.plate} ${v.clientName} ${v.clientPhone} ${v.brand} ${v.model}`).includes(q),
      )
    : rows

  const revenue = await estimatedRevenueByVehicle(filtered.map(v => v.id))

  const header = [
    "Plaque",
    "Client",
    "Téléphone",
    "Véhicule",
    "Type",
    "Segment",
    "Hub",
    "Visites",
    "Dernière visite",
    "CA cumulé estimé (DT)",
  ]
  const lines = filtered.map(v => [
    esc(v.plate),
    esc(v.clientName),
    esc(v.clientPhone),
    esc(`${v.brand} ${v.model}`),
    esc(v.type),
    esc(v.segment),
    esc(`${v.hub.code} — ${v.hub.name}`),
    v.visitsCount,
    esc(dateFr(v.lastVisit)),
    decFr(revenue.get(v.id) ?? 0),
  ].join(";"))

  const csv = `\uFEFF${[header.join(";"), ...lines].join("\r\n")}`
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-tmp-${stamp}.csv"`,
      // Marqueur métier pour le client (toast) : nombre de lignes exportées.
      "X-Rows-Count": String(filtered.length),
    },
  })
}
