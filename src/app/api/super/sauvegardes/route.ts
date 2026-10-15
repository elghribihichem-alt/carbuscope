// Super Administration — ④ Sauvegardes SQLite : COPIE PHYSIQUE réelle du
// fichier base, restauration avec instantané préalable, journal audité.
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import * as fs from "fs"
import * as path from "path"
import { db } from "@/lib/db"
import { logAudit, serializeSauvegarde } from "@/lib/sa-server"

export const dynamic = "force-dynamic"

const DB_DIR = path.join(process.cwd(), "db")
const DB_PATH = path.join(DB_DIR, "custom.db")
const BACKUPS_DIR = path.join(DB_DIR, "backups")

export async function GET() {
  const sauvegardes = await db.sauvegarde.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({
    sauvegardes: sauvegardes.map(serializeSauvegarde),
    disque: {
      baseTailleKo: fs.existsSync(DB_PATH) ? Math.round(fs.statSync(DB_PATH).size / 1024) : 0,
      backupsTailleKo: fs.existsSync(BACKUPS_DIR)
        ? Math.round(fs.readdirSync(BACKUPS_DIR).reduce((s, f) => s + fs.statSync(path.join(BACKUPS_DIR, f)).size, 0) / 1024)
        : 0,
    },
  })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { note?: string }
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const nomFichier = `backup-manuel-${horodatage}.db`
  const t0 = performance.now()
  try {
    fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, nomFichier))
  } catch (e) {
    return NextResponse.json({ error: `Échec de copie : ${e instanceof Error ? e.message : "inconnu"}` }, { status: 500 })
  }
  const dureeMs = Math.round(performance.now() - t0)
  const nbTables = await db.$queryRaw<{ count: number }[]>(
    Prisma.sql`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`,
  ).then(r => Number(r[0]?.count ?? 0)).catch(() => 0)
  const s = await db.sauvegarde.create({
    data: {
      nomFichier, type: "MANUELLE", statut: "REUSSIE",
      tailleKo: Math.round(fs.statSync(path.join(BACKUPS_DIR, nomFichier)).size / 1024),
      nbTables, dureeMs,
      note: body.note?.slice(0, 200) ?? "Sauvegarde manuelle déclenchée depuis la Super Administration.",
    },
  })
  await logAudit({
    module: "SUPERVISION",
    action: "Sauvegarde manuelle créée",
    cibleType: "SAUVEGARDE",
    cibleLabel: nomFichier,
    severite: "SENSIBLE",
    details: `Copie physique de la base (${(s.tailleKo / 1024).toFixed(1)} Mo) en ${dureeMs} ms.`,
  })
  return NextResponse.json({ sauvegarde: serializeSauvegarde(s) }, { status: 201 })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (!id || body.action !== "restaurer") return NextResponse.json({ error: "id + action=restaurer requis." }, { status: 400 })
  const s = await db.sauvegarde.findUnique({ where: { id } })
  if (!s) return NextResponse.json({ error: "Sauvegarde introuvable." }, { status: 404 })
  const cible = path.join(BACKUPS_DIR, s.nomFichier)
  if (!fs.existsSync(cible)) return NextResponse.json({ error: "Fichier de sauvegarde absent du disque (seed ancien)." }, { status: 409 })

  // Instantané préalable (sécurité) puis restauration physique.
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  const pre = `backup-pre-restauration-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`
  fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, pre))
  await db.sauvegarde.create({
    data: {
      nomFichier: pre, type: "PRE_RESTAURATION", statut: "REUSSIE",
      tailleKo: Math.round(fs.statSync(path.join(BACKUPS_DIR, pre)).size / 1024),
      nbTables: s.nbTables, dureeMs: s.dureeMs,
      note: `Instantané pris avant restauration de ${s.nomFichier}.`,
    },
  })
  fs.copyFileSync(cible, DB_PATH)
  await logAudit({
    module: "SUPERVISION",
    action: "Base restaurée depuis une sauvegarde",
    cibleType: "SAUVEGARDE",
    cibleLabel: s.nomFichier,
    severite: "CRITIQUE",
    details: `Restauration physique du fichier ${s.nomFichier} — instantané préalable ${pre}.`,
  })
  return NextResponse.json({ restaure: s.nomFichier, instantane: pre })
}
