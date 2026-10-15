import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  serializeHubSetting, serializePrice, serializeTire, serializeTemplate,
  serializeLoyalty, serializeEquipment, serializeStock,
} from "@/lib/t51-server"
import { logAudit } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

// T51 — Paramètres TMP (Mobility Hub Operations).
// GET ?brand= → réglage de l'enseigne + grille tarifaire + catalogue pneus +
//      templates diagnostic + programme fidélité + équipements (statut
//      maintenance) + synthèse stocks du réseau.
// POST actions : « maj-reglage » (activation + seuils — SA ou DG de sa propre
//      enseigne), « maj-prix », « maj-tire », « maj-template », « maj-loyalty »,
//      « maj-equipement » (maintenance réalisée), « maj-stock » (réassort).

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand")?.trim() || null
  const hubRows = await (brand
    ? db.mobilityHub.findMany({ where: { brandSlug: brand }, select: { id: true, code: true } })
    : db.mobilityHub.findMany({ select: { id: true, code: true } }))
  const hubIdList = hubRows.map(h => h.id)
  const codeById = new Map(hubRows.map(h => [h.id, h.code]))
  const [setting, prices, tires, templates, loyalty, equipment, stocks] = await Promise.all([
    brand ? db.hubSetting.findUnique({ where: { brandSlug: brand } }) : db.hubSetting.findFirst({ where: { brandSlug: null } }),
    brand ? db.hubPriceItem.findMany({ where: { brandSlug: brand }, orderBy: { serviceType: "asc" } }) : db.hubPriceItem.findMany(),
    db.hubTireProduct.findMany({ orderBy: [{ brand: "asc" }, { size: "asc" }] }),
    brand ? db.hubDiagnosticTemplate.findMany({ where: { brandSlug: brand } }) : db.hubDiagnosticTemplate.findMany(),
    brand ? db.hubLoyaltyRule.findMany({ where: { brandSlug: brand } }) : db.hubLoyaltyRule.findMany(),
    db.hubEquipment.findMany({
      where: hubIdList.length ? { hubId: { in: hubIdList } } : {},
      orderBy: [{ status: "desc" }, { name: "asc" }],
    }),
    db.hubStockItem.findMany({
      where: hubIdList.length ? { hubId: { in: hubIdList } } : {},
      orderBy: [{ quantity: "asc" }],
    }),
  ])
  return NextResponse.json({
    setting: setting ? serializeHubSetting(setting) : null,
    prices: prices.map(serializePrice),
    tires: tires.map(serializeTire),
    templates: templates.map(serializeTemplate),
    loyalty: loyalty.map(serializeLoyalty),
    equipment: equipment.map(e => serializeEquipment(e, codeById.get(e.hubId))),
    stocks: stocks.map(s => serializeStock(s, codeById.get(s.hubId))),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined
  const acteur = actor ? { nom: "Utilisateur", email: actor, role: "PORTAIL" } : undefined

  if (body.action === "maj-reglage") {
    const brandSlug = typeof body.brandSlug === "string" && body.brandSlug.trim() ? body.brandSlug.trim() : null
    const data = {
      enabled: Boolean(body.enabled),
      vehicleAlertKm: Math.round(num(body.vehicleAlertKm, 500, 30000, 5000)),
      vehicleAlertDays: Math.round(num(body.vehicleAlertDays, 7, 365, 90)),
      equipmentAlertDays: Math.round(num(body.equipmentAlertDays, 30, 720, 180)),
      conversionTargetPct: Math.round(num(body.conversionTargetPct, 5, 90, 25)),
      updatedBy: actor ?? null,
    }
    const existing = brandSlug
      ? await db.hubSetting.findUnique({ where: { brandSlug } })
      : await db.hubSetting.findFirst({ where: { brandSlug: null } })
    const row = existing
      ? await db.hubSetting.update({ where: { id: existing.id }, data })
      : await db.hubSetting.create({ data: { brandSlug, ...data } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Paramétrage Mobility Hub Operations",
      cibleType: "Enseigne", cibleLabel: brandSlug ?? "Réglage global",
      details: `${data.enabled ? "activé" : "désactivé"} · objectif conversion ${data.conversionTargetPct} %`,
    })
    return NextResponse.json({ ok: true, setting: serializeHubSetting(row) })
  }

  if (body.action === "maj-prix") {
    const itemId = typeof body.itemId === "string" ? body.itemId : ""
    if (!itemId) return NextResponse.json({ error: "Paramètre « itemId » requis" }, { status: 400 })
    const item = await db.hubPriceItem.findUnique({ where: { id: itemId } })
    if (!item) return NextResponse.json({ error: "Ligne tarifaire introuvable" }, { status: 404 })
    const price = num(body.price, 0, 10000, item.price)
    const durationMin = Math.round(num(body.durationMin, 5, 480, item.durationMin))
    const active = typeof body.active === "boolean" ? body.active : item.active
    await db.hubPriceItem.update({ where: { id: itemId }, data: { price, durationMin, active } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Mise à jour de la grille tarifaire TMP",
      cibleType: "Service", cibleLabel: `${item.label} (${item.brandSlug})`,
      details: `${price.toLocaleString("fr-FR")} DT · ${durationMin} min`,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "maj-tire") {
    const productId = typeof body.productId === "string" ? body.productId : ""
    if (!productId) return NextResponse.json({ error: "Paramètre « productId » requis" }, { status: 400 })
    const p = await db.hubTireProduct.findUnique({ where: { id: productId } })
    if (!p) return NextResponse.json({ error: "Pneu introuvable" }, { status: 404 })
    const price = num(body.price, 0, 5000, p.price)
    const active = typeof body.active === "boolean" ? body.active : p.active
    await db.hubTireProduct.update({ where: { id: productId }, data: { price, active } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Mise à jour du catalogue pneus",
      cibleType: "Pneu", cibleLabel: `${p.brand} ${p.model} ${p.size}`,
      details: `${price.toLocaleString("fr-FR")} DT`,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "maj-template") {
    const templateId = typeof body.templateId === "string" ? body.templateId : ""
    if (!templateId) return NextResponse.json({ error: "Paramètre « templateId » requis" }, { status: 400 })
    const t = await db.hubDiagnosticTemplate.findUnique({ where: { id: templateId } })
    if (!t) return NextResponse.json({ error: "Template introuvable" }, { status: 404 })
    const active = typeof body.active === "boolean" ? body.active : t.active
    await db.hubDiagnosticTemplate.update({ where: { id: templateId }, data: { active } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: `${active ? "Activation" : "Désactivation"} d'un template diagnostic`,
      cibleType: "Template", cibleLabel: `${t.code} — ${t.name}`,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "maj-loyalty") {
    const ruleId = typeof body.ruleId === "string" ? body.ruleId : ""
    if (!ruleId) return NextResponse.json({ error: "Paramètre « ruleId » requis" }, { status: 400 })
    const rule = await db.hubLoyaltyRule.findUnique({ where: { id: ruleId } })
    if (!rule) return NextResponse.json({ error: "Règle de fidélité introuvable" }, { status: 404 })
    const points = Math.round(num(body.points, 0, 200, rule.points))
    const rewardThreshold = Math.round(num(body.rewardThreshold, 10, 5000, rule.rewardThreshold))
    const active = typeof body.active === "boolean" ? body.active : rule.active
    await db.hubLoyaltyRule.update({ where: { id: ruleId }, data: { points, rewardThreshold, active } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Mise à jour du programme de fidélité",
      cibleType: "Règle", cibleLabel: `${rule.action} (${rule.brandSlug})`,
      details: `${points} pts · récompense à ${rewardThreshold} pts`,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "maj-equipement") {
    const equipmentId = typeof body.equipmentId === "string" ? body.equipmentId : ""
    if (!equipmentId) return NextResponse.json({ error: "Paramètre « equipmentId » requis" }, { status: 400 })
    const e = await db.hubEquipment.findUnique({ where: { id: equipmentId } })
    if (!e) return NextResponse.json({ error: "Équipement introuvable" }, { status: 404 })
    const hub = await db.mobilityHub.findUnique({ where: { id: e.hubId }, select: { code: true, brandSlug: true } })
    const setting = hub ? await db.hubSetting.findUnique({ where: { brandSlug: hub.brandSlug } }) : null
    const intervalDays = setting?.equipmentAlertDays ?? 180
    const next = new Date()
    next.setDate(next.getDate() + intervalDays)
    await db.hubEquipment.update({
      where: { id: equipmentId },
      data: { lastMaintenanceAt: new Date(), nextMaintenanceAt: next, status: "OK" },
    })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Maintenance d'équipement réalisée",
      cibleType: "Équipement", cibleLabel: `${e.name} — ${hub?.code ?? e.hubId}`,
      details: `Prochaine maintenance dans ${intervalDays} jours`,
    })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "maj-stock") {
    const itemId = typeof body.itemId === "string" ? body.itemId : ""
    if (!itemId) return NextResponse.json({ error: "Paramètre « itemId » requis" }, { status: 400 })
    const s = await db.hubStockItem.findUnique({ where: { id: itemId } })
    if (!s) return NextResponse.json({ error: "Ligne de stock introuvable" }, { status: 404 })
    const hub = await db.mobilityHub.findUnique({ where: { id: s.hubId }, select: { code: true } })
    const quantity = Math.round(num(body.quantity, 0, 999, s.quantity))
    await db.hubStockItem.update({ where: { id: itemId }, data: { quantity } })
    await logAudit({
      acteur, module: "MOBILITY",
      action: "Réassort de stock TMP",
      cibleType: "Stock", cibleLabel: `${s.label} — ${hub?.code ?? s.hubId}`,
      details: `Quantité : ${quantity}`,
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 })
}
