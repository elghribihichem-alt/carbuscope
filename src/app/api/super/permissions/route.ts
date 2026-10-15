import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit } from "@/lib/sa-server"
import { requireSession } from "@/lib/auth"
import { PERM_MODULES, PERM_GROUPS, PERM_MODULE_KEYS, fullPermissions } from "@/lib/saas-perms"

export const dynamic = "force-dynamic"

// T48 — Matrice de permissions SaaS (Super Administration).
//   GET    ?roleId=   → catalogue + rôles (avec matrice + effectifs)
//   PUT               → enregistre la matrice d'un rôle (racine / sa.permissions≥2)
//   POST              → crée un rôle personnalisé
//   PATCH             → renomme / redécrit un rôle (non système)
//   DELETE ?id=       → supprime un rôle personnalisé sans utilisateur

type RoleRow = {
  id: string
  code: string
  name: string
  description: string
  isSystem: boolean
  rank: number
  userCount: number
  permissions: Record<string, number>
}

async function roleRows(): Promise<RoleRow[]> {
  const roles = await db.saasRole.findMany({
    orderBy: [{ rank: "asc" }, { name: "asc" }],
    include: { permissions: true, _count: { select: { users: true } } },
  })
  return roles.map(r => {
    const permissions = Object.fromEntries(PERM_MODULE_KEYS.map(k => [k, 0]))
    for (const p of r.permissions) permissions[p.moduleKey] = p.level
    // La racine est implicitement maître de tout (cohérence d'affichage).
    if (r.code === "SUPER_ADMIN") Object.assign(permissions, fullPermissions())
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      rank: r.rank,
      userCount: r._count.users,
      permissions,
    }
  })
}

const actorFrom = (s: { name: string; email: string; role: string }) => ({ nom: s.name, email: s.email, role: s.role })

async function requireMatrixEditor() {
  const session = await requireSession()
  if (!session) return { error: NextResponse.json({ error: "Session requise" }, { status: 401 }) } as const
  const root = session.role === "SUPER_ADMIN"
  const editor = (session.permissions?.["sa.permissions"] ?? 0) >= 2
  if (!root && !editor) {
    return { error: NextResponse.json({ error: "Réservé à la gestion des rôles (permission requise)" }, { status: 403 }) } as const
  }
  return { session } as const
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: "Session requise" }, { status: 401 })
  const root = session.role === "SUPER_ADMIN"
  const viewer = root || (session.permissions?.["sa.permissions"] ?? 0) >= 1
  if (!viewer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const roles = await roleRows()
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, brandSlug: true, active: true, saasRoleId: true },
    orderBy: [{ name: "asc" }],
  })
  return NextResponse.json({
    roles,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      platformRole: u.role,
      brandSlug: u.brandSlug,
      active: u.active,
      saasRoleId: u.saasRoleId,
    })),
    modules: PERM_MODULES,
    groups: PERM_GROUPS,
    me: { saasRoleCode: session.saasRoleCode, isRoot: root },
  })
}

export async function PUT(req: NextRequest) {
  const guard = await requireMatrixEditor()
  if ("error" in guard) return guard.error
  const body = (await req.json().catch(() => null)) as { roleId?: string; matrix?: Record<string, unknown> } | null
  const roleId = body?.roleId
  const matrix = body?.matrix
  if (!roleId || !matrix || typeof matrix !== "object") {
    return NextResponse.json({ error: "roleId et matrix sont requis" }, { status: 400 })
  }
  const role = await db.saasRole.findUnique({ where: { id: roleId }, include: { permissions: true, _count: { select: { users: true } } } })
  if (!role) return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 })
  if (role.code === "SUPER_ADMIN") {
    return NextResponse.json({ error: "La racine est maîtresse de tout par conception — matrice non modifiable" }, { status: 422 })
  }

  // Validation : clés du catalogue uniquement, niveaux 0/1/2.
  const clean: { moduleKey: string; level: number }[] = []
  for (const [k, v] of Object.entries(matrix)) {
    if (!PERM_MODULE_KEYS.includes(k)) continue
    const level = Number(v)
    if (![0, 1, 2].includes(level)) continue
    clean.push({ moduleKey: k, level })
  }
  if (clean.length === 0) return NextResponse.json({ error: "Matrice vide ou invalide" }, { status: 422 })

  await db.saasPermission.deleteMany({ where: { roleId } })
  await db.saasPermission.createMany({ data: clean.map(c => ({ roleId, ...c })) })

  const total = clean.filter(c => c.level > 0).length
  await logAudit({
    acteur: actorFrom(guard.session),
    module: "PERMISSIONS",
    action: "Matrice mise à jour",
    cibleType: "ROLE",
    cibleLabel: `${role.name} (${role.code})`,
    details: `${total}/${PERM_MODULE_KEYS.length} modules ouverts · ${role._count.users} utilisateur(s) concerné(s)`,
    severite: "SENSIBLE",
  })
  return NextResponse.json({ ok: true, saved: clean.length, modules: total })
}

export async function POST(req: NextRequest) {
  const guard = await requireMatrixEditor()
  if ("error" in guard) return guard.error
  const body = (await req.json().catch(() => null)) as
    | { code?: string; name?: string; description?: string; templateRoleId?: string }
    | null
  const code = body?.code?.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")
  const name = body?.name?.trim()
  if (!code || !name) return NextResponse.json({ error: "Code et nom sont requis" }, { status: 400 })
  if (code.length < 3 || code.length > 40) return NextResponse.json({ error: "Code : 3 à 40 caractères" }, { status: 422 })
  const exists = await db.saasRole.findUnique({ where: { code } })
  if (exists) return NextResponse.json({ error: `Le code ${code} existe déjà` }, { status: 409 })

  // Copie optionnelle de la matrice d'un rôle modèle.
  const template = body?.templateRoleId
    ? await db.saasRole.findUnique({ where: { id: body.templateRoleId }, include: { permissions: true } })
    : null

  const role = await db.saasRole.create({
    data: {
      code,
      name,
      description: body?.description?.trim() ?? "",
      rank: 200,
      isSystem: false,
      permissions: template
        ? { create: template.permissions.map(p => ({ moduleKey: p.moduleKey, level: p.level })) }
        : undefined,
    },
  })
  await logAudit({
    acteur: actorFrom(guard.session),
    module: "PERMISSIONS",
    action: "Rôle créé",
    cibleType: "ROLE",
    cibleLabel: `${name} (${code})`,
    details: template ? `Modèle : ${template.name}` : "Matrice vierge",
  })
  return NextResponse.json({ ok: true, role: { id: role.id, code: role.code } })
}

export async function PATCH(req: NextRequest) {
  const guard = await requireMatrixEditor()
  if ("error" in guard) return guard.error
  const body = (await req.json().catch(() => null)) as { id?: string; name?: string; description?: string } | null
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const role = await db.saasRole.findUnique({ where: { id: body.id } })
  if (!role) return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 })
  if (role.isSystem && body.name && body.name !== role.name) {
    return NextResponse.json({ error: "Le nom d'un rôle système ne se modifie pas" }, { status: 422 })
  }
  await db.saasRole.update({
    where: { id: body.id },
    data: {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
    },
  })
  await logAudit({
    acteur: actorFrom(guard.session),
    module: "PERMISSIONS",
    action: "Rôle modifié",
    cibleType: "ROLE",
    cibleLabel: `${role.name} (${role.code})`,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await requireMatrixEditor()
  if ("error" in guard) return guard.error
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const role = await db.saasRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
  if (!role) return NextResponse.json({ error: "Rôle introuvable" }, { status: 404 })
  if (role.isSystem) return NextResponse.json({ error: "Un rôle système ne se supprime pas" }, { status: 422 })
  if (role._count.users > 0) {
    return NextResponse.json({ error: `${role._count.users} utilisateur(s) portent ce rôle — réaffectez-les d'abord` }, { status: 422 })
  }
  await db.saasRole.delete({ where: { id } })
  await logAudit({
    acteur: actorFrom(guard.session),
    module: "PERMISSIONS",
    action: "Rôle supprimé",
    cibleType: "ROLE",
    cibleLabel: `${role.name} (${role.code})`,
    severite: "SENSIBLE",
  })
  return NextResponse.json({ ok: true })
}
