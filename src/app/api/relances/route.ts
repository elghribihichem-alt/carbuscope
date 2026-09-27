// T43 — /api/relances : relances de fraîcheur « J+7 » (cahier des charges §3.2 —
// délai de mise à jour < 7 jours entre détection et MAJ d'une fiche station).
//   GET  ?brand=&seuil=7&limit=100 → fiches au-delà du seuil + KPIs de fraîcheur
//   POST { brand, codes[] }        → envoie les relances (notifications RELANCE
//                                    au portail enseigne, relais WebSocket live,
//                                    anti-spam 24 h, audit journalisé)
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { relayNotifications } from "@/lib/notif-relay"
import { logAudit } from "@/lib/sa-server"
import type { RelanceStationDTO, RelancesKpis } from "@/lib/types"

export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000

const dateFr = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d)

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim().toLowerCase() ?? ""
  const seuil = Math.min(Math.max(Number(req.nextUrl.searchParams.get("seuil") ?? 7) || 7, 1), 90)
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100, 500)

  if (!brand) {
    return NextResponse.json({ error: "Paramètre « brand » requis." }, { status: 400 })
  }
  const brandRow = await db.brand.findUnique({ where: { slug: brand }, select: { name: true, color: true } })
  if (!brandRow) {
    return NextResponse.json({ error: "Enseigne inconnue." }, { status: 404 })
  }

  const cutoff = new Date(Date.now() - seuil * DAY_MS)

  // Fiches actives de l'enseigne (hors projets) au-delà du seuil + total pour le taux.
  const [stationsLate, total, relancesRecentes] = await Promise.all([
    db.station.findMany({
      where: {
        status: { in: ["ACTIVE", "RENOVATION"] },
        lastVerified: { lt: cutoff },
      },
      orderBy: { lastVerified: "asc" },
      take: limit,
    }),
    db.station.count({
      where: { status: { in: ["ACTIVE", "RENOVATION"] } },
    }),
    db.notification.findMany({
      where: { brandSlug: brand, kind: "RELANCE" },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { stationLabel: true, createdAt: true },
    }),
  ])

  // Dernière relance connue par fiche (stationLabel = code station) + anti-spam 24 h.
  const lastReminderByCode = new Map<string, Date>()
  const dayAgo = Date.now() - DAY_MS
  let relanced24h = 0
  for (const n of relancesRecentes) {
    const code = n.stationLabel ?? ""
    if (!code) continue
    if (!lastReminderByCode.has(code)) lastReminderByCode.set(code, n.createdAt)
    if (n.createdAt.getTime() > dayAgo) relanced24h += 1
  }

  // Filtre enseigne a posteriori (brandId relation — évite un join par station).
  const brandIds = new Set(
    (await db.brand.findMany({ where: { slug: brand }, select: { id: true } })).map(b => b.id),
  )
  const late = stationsLate.filter(s => s.brandId && brandIds.has(s.brandId))

  const now = Date.now()
  const stations: RelanceStationDTO[] = late.map(s => ({
    code: s.code,
    name: s.name,
    brandSlug: brand,
    brandName: brandRow.name,
    brandColor: brandRow.color,
    gouvernorat: s.gouvernorat,
    delegation: s.delegation,
    lastVerified: s.lastVerified.toISOString(),
    daysLate: Math.floor((now - s.lastVerified.getTime()) / DAY_MS),
    verifiedBy: s.verifiedBy || "",
    lastReminderAt: lastReminderByCode.get(s.code)?.toISOString() ?? null,
  }))

  const delays = stations.map(s => s.daysLate)
  const kpis: RelancesKpis = {
    total,
    overdue: stations.length,
    freshnessRate: total > 0 ? Math.round(((total - stations.length) / total) * 1000) / 10 : 100,
    avgDaysLate: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0,
    oldestDays: delays.length ? Math.max(...delays) : 0,
    relanced24h,
  }

  return NextResponse.json(
    { seuil, stations, kpis },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { brand?: string; codes?: string[] }
  const brand = (body.brand ?? "").trim().toLowerCase()
  const codes = Array.from(new Set((body.codes ?? []).map(c => c.trim()).filter(Boolean)))

  if (!brand) return NextResponse.json({ error: "Paramètre « brand » requis." }, { status: 400 })
  if (!codes.length) return NextResponse.json({ error: "Aucune station sélectionnée." }, { status: 400 })
  if (codes.length > 100) return NextResponse.json({ error: "100 fiches maximum par envoi." }, { status: 400 })

  const brandRow = await db.brand.findUnique({ where: { slug: brand }, select: { name: true } })
  if (!brandRow) return NextResponse.json({ error: "Enseigne inconnue." }, { status: 404 })

  const stations = await db.station.findMany({ where: { code: { in: codes } } })
  const byCode = new Map(stations.map(s => [s.code, s]))

  // Anti-spam : une seule relance par fiche et par tranche de 24 h.
  const dayAgo = new Date(Date.now() - DAY_MS)
  const recentes = await db.notification.findMany({
    where: { brandSlug: brand, kind: "RELANCE", stationLabel: { in: codes }, createdAt: { gt: dayAgo } },
    select: { stationLabel: true },
  })
  const dejaRelancees = new Set(recentes.map(n => n.stationLabel ?? ""))

  const aEnvoyer = codes
    .map(code => byCode.get(code))
    .filter((s): s is NonNullable<typeof s> => Boolean(s) && !dejaRelancees.has(s!.code))

  if (aEnvoyer.length > 0) {
    const now = Date.now()
    await db.notification.createMany({
      data: aEnvoyer.map(s => {
        const jours = Math.floor((now - s.lastVerified.getTime()) / DAY_MS)
        return {
          brandSlug: brand,
          kind: "RELANCE",
          title: `Fiche à re-vérifier — ${s.name}`,
          body:
            `Dernier contrôle il y a ${jours} jour${jours > 1 ? "s" : ""} (${dateFr(s.lastVerified)}` +
            `${s.verifiedBy ? `, par ${s.verifiedBy}` : ""}). Merci de procéder à la re-vérification ` +
            `de la fiche ${s.code} — ${s.gouvernorat} / ${s.delegation} (cahier des charges §3.2 : ` +
            `mise à jour sous 7 jours après détection).`,
          stationLabel: s.code,
          deltaPoints: null,
        }
      }),
    })
    // Relais WebSocket : le portail enseigne connecté voit la relance en direct.
    void relayNotifications(
      aEnvoyer.map(s => {
        const jours = Math.floor((now - s.lastVerified.getTime()) / DAY_MS)
        return {
          brandSlug: brand,
          kind: "RELANCE",
          title: `Fiche à re-vérifier — ${s.name} (${jours} j)`,
          body: `Re-vérification de la fiche ${s.code} — ${s.gouvernorat} / ${s.delegation}`,
          createdAt: new Date().toISOString(),
        }
      }),
    )
    await logAudit({
      module: "VEILLE",
      action: "Relances J+7 envoyées",
      cibleType: "ENSEIGNE",
      cibleLabel: brandRow.name,
      details: `${aEnvoyer.length} fiche(s) relancée(s)${dejaRelancees.size ? `, ${dejaRelancees.size} ignorée(s) (anti-spam 24 h)` : ""}`,
    })
  }

  return NextResponse.json({
    sent: aEnvoyer.length,
    skipped: codes.length - aEnvoyer.length,
    notifiedBrand: brandRow.name,
  })
}
