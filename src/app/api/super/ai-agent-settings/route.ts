import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/saas-server"
import type { AiBrandSettingDTO } from "@/lib/saas"

export const dynamic = "force-dynamic"

// Activation de l'agent IA interne (Phase 3 Super Admin) : l'agent est toujours
// disponible pour la Super Administration ; cet écran ouvre l'accès enseigne
// par enseigne puis membre par membre. Persistance AiAgentBrandSetting /
// AiAgentUserSetting (défaut désactivé), chaque bascule est auditée AGENT_IA.

// GET /api/super/ai-agent-settings — enseignes clientes avec personnel et
// états d'activation de l'agent IA (défaut false).
export async function GET() {
  const [contracts, brandSettings, userSettings] = await Promise.all([
    db.saasContract.findMany({ orderBy: { brandName: "asc" } }),
    db.aiAgentBrandSetting.findMany(),
    db.aiAgentUserSetting.findMany(),
  ])
  const brandEnabled = new Map(brandSettings.map(s => [s.brandSlug, s.enabled]))
  const userEnabled = new Map(userSettings.map(s => [s.userId, s.enabled]))

  const users = await db.user.findMany({ orderBy: { name: "asc" } })
  const usersBySlug = new Map<string, typeof users>()
  for (const u of users) {
    if (!u.brandSlug) continue
    const list = usersBySlug.get(u.brandSlug) ?? []
    list.push(u)
    usersBySlug.set(u.brandSlug, list)
  }

  const brands: AiBrandSettingDTO[] = contracts.map(c => ({
    brandSlug: c.brandSlug,
    brandName: c.brandName,
    color: c.color,
    plan: c.plan,
    contractStatus: c.status,
    enabled: brandEnabled.get(c.brandSlug) ?? false,
    users: (usersBySlug.get(c.brandSlug) ?? []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      enabled: userEnabled.get(u.id) ?? false,
    })),
  }))

  return NextResponse.json({ brands })
}

// POST /api/super/ai-agent-settings — bascule d'activation :
// { scope: "brand" | "user", key, enabled, actor? } (upsert + audit AGENT_IA).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }

  const scope = body.scope
  if (scope !== "brand" && scope !== "user") {
    return NextResponse.json(
      { error: "Portée invalide — « brand » (enseigne) ou « user » (utilisateur) attendue" },
      { status: 400 }
    )
  }
  const key = typeof body.key === "string" ? body.key.trim() : ""
  if (!key) {
    return NextResponse.json({ error: "Clé requise (identifiant de l'enseigne ou de l'utilisateur)" }, { status: 400 })
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Valeur « enabled » invalide — booléen attendu" }, { status: 400 })
  }
  const enabled: boolean = body.enabled
  const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : undefined
  const verb = enabled ? "activé" : "désactivé"

  if (scope === "brand") {
    const contract = await db.saasContract.findUnique({ where: { brandSlug: key } })
    if (!contract) {
      return NextResponse.json({ error: "Enseigne introuvable" }, { status: 404 })
    }
    await db.aiAgentBrandSetting.upsert({
      where: { brandSlug: key },
      create: { brandSlug: key, enabled },
      update: { enabled },
    })
    await logAudit({
      kind: "AGENT_IA",
      message: `Agent IA ${verb} pour ${contract.brandName}`,
      actor,
      brandSlug: key,
    })
    return NextResponse.json({ ok: true })
  }

  // scope === "user"
  const user = await db.user.findUnique({ where: { id: key } })
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
  }
  const contract = user.brandSlug
    ? await db.saasContract.findUnique({ where: { brandSlug: user.brandSlug } })
    : null
  const brandName = contract?.brandName ?? user.brandSlug ?? "sans enseigne"

  await db.aiAgentUserSetting.upsert({
    where: { userId: key },
    create: { userId: key, enabled },
    update: { enabled },
  })
  await logAudit({
    kind: "AGENT_IA",
    message: `Agent IA ${verb} pour ${user.name} (${brandName})`,
    actor,
    brandSlug: user.brandSlug ?? null,
  })
  return NextResponse.json({ ok: true })
}
