import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeDemographicAccess, serializeDemographicCite, serializeDemographicDelegation, serializeDemographicGouvernorat } from "@/lib/saas-server"
import { DEMOGRAPHIC_LEVELS, type DemographicAccessDTO } from "@/lib/saas"
import {
  applyCiteDelete, applyCiteUpdate, applyDelegationUpdate, applyGouvernoratUpdate,
  parcCoherenceWarning, validateCiteValues, validateDelegationValues, validateGouvernoratValues,
  GOV_IMPORT_ALIASES, DELEG_IMPORT_ALIASES, CITE_IMPORT_ALIASES,
  type DelegationValues,
} from "@/lib/demographie-server"

export const dynamic = "force-dynamic"

// Module Démographie (T35 + T37 + T45) : statistiques territoriales de la
// Tunisie. GET → référentiel complet (24 gouvernorats INS 2024, 277 délégations
// et cités du 3ᵉ niveau) et accès accordés (volet « Paramétrage »).
// POST → actions : « maj-delegation » (T35), « maj-gouvernorat » (T37),
//        « maj-cite » / « suppr-cite » (T45 — volet Cités), « reinitialiser »,
//        « maj-acces » (volet Paramétrage) et « import » (JSON/CSV/XLS/XML en
//        masse — gouvernorats, délégations et cités). Les imports retournent un
//        compte-rendu détaillé { updated, created, warnings, errors, skipped }.
// Transversal : le socle GovernoratStat alimente déjà carte, implantation,
// rapports, calculateurs et back-office — les PATCH ne touchent que les
// colonnes visées, validations FR champ par champ.

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

// GET /api/super/demographie — référentiel + accès.
export async function GET() {
  const [governorats, delegations, cites, accessRows, users] = await Promise.all([
    db.governoratStat.findMany({ orderBy: { isoCode: "asc" } }),
    db.demographicDelegation.findMany({ orderBy: [{ isoCode: "asc" }, { delegation: "asc" }] }),
    db.demographicCite.findMany({ orderBy: [{ gouvernorat: "asc" }, { delegation: "asc" }, { cite: "asc" }] }),
    db.demographicAccess.findMany(),
    db.user.findMany(),
  ])
  const userById = new Map(users.map(u => [u.id, u]))
  const access: DemographicAccessDTO[] = accessRows
    .map(a => {
      const u = userById.get(a.userId)
      if (!u) return null
      return serializeDemographicAccess(a, u)
    })
    .filter((x): x is DemographicAccessDTO => x !== null)
  return NextResponse.json({
    governorats: governorats.map(serializeDemographicGouvernorat),
    delegations: delegations.map(serializeDemographicDelegation),
    cites: cites.map(serializeDemographicCite),
    access,
  })
}

// POST /api/super/demographie — actions d'administration.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined

  // ---- Réinitialisation (T35) ----
  if (body.action === "reinitialiser") {
    const res = await db.demographicDelegation.updateMany({
      data: {
        population: null,
        urbanPct: null,
        ruralPct: null,
        vehiclesLight: null,
        vehiclesUtility: null,
        vehiclesHeavy: null,
        vehiclesBuses: null,
        vehiclesMotorcycles: null,
        updatedAt: null,
        updatedBy: null,
      },
    })
    await logAudit({
      kind: "DEMOGRAPHIE",
      message: `Démographie réinitialisée — valeurs des ${res.count} délégations remises à zéro`,
      actor,
    })
    return NextResponse.json({ reset: true, count: res.count })
  }

  // ---- Édition d'une délégation (T35) ----
  if (body.action === "maj-delegation") {
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de délégation requis" }, { status: 400 })
    const check = validateDelegationValues(body.values)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    const res = await applyDelegationUpdate(id, check.values, actor)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ delegation: res.row })
  }

  // ---- Édition d'un gouvernorat (T37 — volet Gouvernorats) ----
  if (body.action === "maj-gouvernorat") {
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de gouvernorat requis" }, { status: 400 })
    const check = validateGouvernoratValues(body.values)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    const res = await applyGouvernoratUpdate(id, check.values, actor)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ governorat: res.row })
  }

  // ---- Édition d'une cité (T45 — volet Cités, Super Administration) ----
  if (body.action === "maj-cite") {
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de cité requis" }, { status: 400 })
    const check = validateCiteValues(body.values)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    const res = await applyCiteUpdate(id, check.values, actor)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ cite: res.row })
  }

  // ---- Suppression d'une cité (T45) ----
  if (body.action === "suppr-cite") {
    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return NextResponse.json({ error: "Identifiant de cité requis" }, { status: 400 })
    const res = await applyCiteDelete(id, actor)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ deleted: true, cite: res.cite })
  }

  // ---- Visibilité par utilisateur (T37 — volet Paramétrage) ----
  if (body.action === "maj-acces") {
    const userId = typeof body.userId === "string" ? body.userId : ""
    if (!userId) return NextResponse.json({ error: "Identifiant utilisateur requis" }, { status: 400 })
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

    const revoke = body.level === "MASQUE" || body.level === null || body.level === undefined
    if (revoke) {
      const existing = await db.demographicAccess.findUnique({ where: { userId } })
      if (!existing) return NextResponse.json({ revoked: true, name: user.name })
      await db.demographicAccess.delete({ where: { userId } })
      await logAudit({
        kind: "DEMOGRAPHIE",
        message: `Visibilité démographie révoquée — ${user.name} (${user.email})`,
        actor,
      })
      return NextResponse.json({ revoked: true, name: user.name })
    }

    if (body.level !== "GOUVERNORATS" && body.level !== "DELEGATIONS" && body.level !== "CITES") {
      return NextResponse.json({ error: "Niveau invalide — GOUVERNORATS, DELEGATIONS, CITES ou MASQUE" }, { status: 400 })
    }
    const canEdit = body.canEdit === true
    const level = body.level
    const updated = await db.demographicAccess.upsert({
      where: { userId },
      create: { userId, level, canEdit, updatedBy: actor ?? "system" },
      update: { level, canEdit, updatedBy: actor ?? "system" },
    })
    const label = DEMOGRAPHIC_LEVELS.find(l => l.value === level)?.label ?? level
    await logAudit({
      kind: "DEMOGRAPHIE",
      message: `Visibilité démographie — ${user.name} (${user.email}) : ${label}${canEdit ? " · édition autorisée" : " · lecture seule"}`,
      actor,
    })
    return NextResponse.json({ access: serializeDemographicAccess(updated, user) })
  }

  // ---- Import en masse (T37/T45 — JSON / CSV / XLS / XML) ----
  if (body.action === "import") {
    const scope = body.scope === "gouvernorats" ? "gouvernorats"
      : body.scope === "delegations" ? "delegations"
        : body.scope === "cites" ? "cites" : null
    if (!scope) return NextResponse.json({ error: "Champ « scope » requis — gouvernorats, delegations ou cites" }, { status: 400 })
    const format = typeof body.format === "string" ? body.format.toUpperCase() : "IMPORT"
    const rawRows = Array.isArray(body.rows) ? body.rows : null
    if (!rawRows) return NextResponse.json({ error: "Champ « rows » (tableau de lignes) requis" }, { status: 400 })
    if (rawRows.length === 0) return NextResponse.json({ error: "Aucune ligne à importer" }, { status: 400 })
    if (rawRows.length > 500) return NextResponse.json({ error: "Import limité à 500 lignes par appel" }, { status: 400 })

    // Champs d'identité : servent uniquement à retrouver la ligne (jamais
    // enregistrés comme valeur) — « isoCode » inclus car présent dans les
    // exports (colonne « Code ISO »).
    const idFields = scope === "gouvernorats" ? ["name", "gouvernorat", "isoCode"]
      : scope === "delegations" ? ["gouvernorat", "delegation"]
        : ["gouvernorat", "delegation", "cite"]
    const valueFields = scope === "gouvernorats" ? Object.keys(GOV_IMPORT_ALIASES)
      : scope === "delegations" ? Object.keys(DELEG_IMPORT_ALIASES)
        : Object.keys(CITE_IMPORT_ALIASES)

    if (scope === "gouvernorats") {
      const all = await db.governoratStat.findMany()
      const byName = new Map(all.map(g => [norm(g.name), g]))
      const byIso = new Map(all.map(g => [norm(g.isoCode ?? ""), g]))
      let updated = 0
      const errors: { label: string; error: string }[] = []
      const warnings: { label: string; warning: string }[] = []
      const skipped: string[] = []
      for (const raw of rawRows) {
        if (!raw || typeof raw !== "object") continue
        const rec = raw as Record<string, unknown>
        const nameKey = typeof rec.name === "string" ? rec.name.trim() : typeof rec.gouvernorat === "string" ? rec.gouvernorat.trim() : ""
        if (!nameKey) { errors.push({ label: "(sans nom)", error: "Nom de gouvernorat requis" }); continue }
        const target = byName.get(norm(nameKey)) ?? byIso.get(norm(nameKey))
        if (!target) { skipped.push(nameKey); continue }
        const values: Record<string, number> = {}
        for (const field of valueFields) {
          if (idFields.includes(field)) continue
          const v = rec[field]
          if (v === null || v === undefined || v === "") continue
          values[field] = v as number
        }
        if (Object.keys(values).length === 0) { errors.push({ label: nameKey, error: "Aucune valeur exploitable sur la ligne" }); continue }
        const check = validateGouvernoratValues(values)
        if (!check.ok) { errors.push({ label: nameKey, error: check.error }); continue }
        const res = await applyGouvernoratUpdate(target.id, check.values, actor)
        if (res.ok) {
          updated++
          const w = parcCoherenceWarning(res.row.population, { vehicles: res.row.vehicles })
          if (w) warnings.push({ label: nameKey, warning: w })
        }
        else errors.push({ label: nameKey, error: res.error })
      }
      await logAudit({
        kind: "DEMOGRAPHIE",
        message: `Import ${format} (gouvernorats) : ${updated} ligne(s) mise(s) à jour${skipped.length ? `, ${skipped.length} inconnue(s)` : ""}${errors.length ? `, ${errors.length} rejetée(s)` : ""}${warnings.length ? `, ${warnings.length} avertissement(s)` : ""}`,
        actor,
      })
      return NextResponse.json({ updated, created: 0, warnings, skipped, errors })
    }

    if (scope === "cites") {
      // T45 — alimentation en masse des véhicules à la granularité cité :
      // upsert sur (gouvernorat, délégation, cité). Une cité inconnue est
      // CRÉÉE ; un couple gouvernorat/délégation inconnu rejette la ligne.
      const delegs = await db.demographicDelegation.findMany()
      const byKey = new Map(delegs.map(d => [`${norm(d.gouvernorat)}|${norm(d.delegation)}`, d]))
      let updated = 0
      let created = 0
      const errors: { label: string; error: string }[] = []
      const warnings: { label: string; warning: string }[] = []
      const skipped: string[] = []
      for (const raw of rawRows) {
        if (!raw || typeof raw !== "object") continue
        const rec = raw as Record<string, unknown>
        const govKey = typeof rec.gouvernorat === "string" ? rec.gouvernorat.trim() : ""
        const delegKey = typeof rec.delegation === "string" ? rec.delegation.trim() : ""
        const citeKey = typeof rec.cite === "string" ? rec.cite.trim() : ""
        const label = `${govKey} / ${delegKey} / ${citeKey}`
        if (!govKey || !delegKey || !citeKey) { errors.push({ label: "(identité incomplète)", error: "Gouvernorat, délégation et cité requis" }); continue }
        const target = byKey.get(`${norm(govKey)}|${norm(delegKey)}`)
        if (!target) { errors.push({ label, error: "Gouvernorat ou délégation inconnu(e) dans le référentiel" }); continue }
        const values: Record<string, number> = {}
        for (const field of valueFields) {
          if (idFields.includes(field)) continue
          const v = rec[field]
          if (v === null || v === undefined || v === "") continue
          values[field] = v as number
        }
        if (Object.keys(values).length === 0) { errors.push({ label, error: "Aucune valeur exploitable sur la ligne" }); continue }
        const check = validateCiteValues(values)
        if (!check.ok) { errors.push({ label, error: check.error }); continue }
        const existing = await db.demographicCite.findUnique({
          where: { gouvernorat_delegation_cite: { gouvernorat: target.gouvernorat, delegation: target.delegation, cite: citeKey } },
        })
        const row = await db.demographicCite.upsert({
          where: { gouvernorat_delegation_cite: { gouvernorat: target.gouvernorat, delegation: target.delegation, cite: citeKey } },
          create: { gouvernorat: target.gouvernorat, delegation: target.delegation, cite: citeKey, ...check.values, source: "Import SA", updatedAt: new Date(), updatedBy: actor ?? "system" },
          update: { ...check.values, source: "Import SA", updatedAt: new Date(), updatedBy: actor ?? "system" },
        })
        if (existing) updated++
        else created++
        // Cohérence : population de la cité ≤ population de la délégation
        if (row.population !== null && target.population !== null && row.population > target.population) {
          warnings.push({
            label,
            warning: `Population de la cité (${row.population.toLocaleString("fr-FR")}) supérieure à celle de la délégation ${target.delegation} (${target.population.toLocaleString("fr-FR")})`,
          })
        }
        const w = parcCoherenceWarning(row.population, row)
        if (w) warnings.push({ label, warning: w })
      }
      await logAudit({
        kind: "DEMOGRAPHIE",
        message: `Import ${format} (cités) : ${updated} mise(s) à jour, ${created} créée(s)${errors.length ? `, ${errors.length} rejetée(s)` : ""}${warnings.length ? `, ${warnings.length} avertissement(s)` : ""}`,
        actor,
      })
      return NextResponse.json({ updated, created, warnings, skipped, errors })
    }

    // scope === "delegations"
    const all = await db.demographicDelegation.findMany()
    const byKey = new Map(all.map(d => [`${norm(d.gouvernorat)}|${norm(d.delegation)}`, d]))
    let updated = 0
    const errors: { label: string; error: string }[] = []
    const warnings: { label: string; warning: string }[] = []
    const skipped: string[] = []
    for (const raw of rawRows) {
      if (!raw || typeof raw !== "object") continue
      const rec = raw as Record<string, unknown>
      const govKey = typeof rec.gouvernorat === "string" ? rec.gouvernorat.trim() : ""
      const delegKey = typeof rec.delegation === "string" ? rec.delegation.trim() : ""
      const label = `${govKey} / ${delegKey}`
      if (!govKey || !delegKey) { errors.push({ label: "(identité incomplète)", error: "Gouvernorat et délégation requis" }); continue }
      const target = byKey.get(`${norm(govKey)}|${norm(delegKey)}`)
      if (!target) { skipped.push(label); continue }
      const values: DelegationValues = {}
      for (const field of valueFields) {
        if (field === "gouvernorat" || field === "delegation") continue
        const v = rec[field]
        if (v === null || v === undefined || v === "") continue
        values[field] = v as number
      }
      if (Object.keys(values).length === 0) { errors.push({ label, error: "Aucune valeur exploitable sur la ligne" }); continue }
      const check = validateDelegationValues(values)
      if (!check.ok) { errors.push({ label, error: check.error }); continue }
      const res = await applyDelegationUpdate(target.id, check.values, actor)
      if (res.ok) {
        updated++
        // Cohérence du parc (T45) : somme des véhicules vs population —
        // avertissement si la motorisation dépasse 0,9 véhicule/habitant.
        const w = parcCoherenceWarning(res.row.population, res.row)
        if (w) warnings.push({ label, warning: w })
      }
      else errors.push({ label, error: res.error })
    }
    await logAudit({
      kind: "DEMOGRAPHIE",
      message: `Import ${format} (délégations) : ${updated} ligne(s) mise(s) à jour${skipped.length ? `, ${skipped.length} inconnue(s)` : ""}${errors.length ? `, ${errors.length} rejetée(s)` : ""}${warnings.length ? `, ${warnings.length} avertissement(s)` : ""}`,
      actor,
    })
    return NextResponse.json({ updated, created: 0, warnings, skipped, errors })
  }

  return NextResponse.json({ error: "Action inconnue — maj-delegation, maj-gouvernorat, maj-cite, suppr-cite, maj-acces, import ou reinitialiser" }, { status: 400 })
}
