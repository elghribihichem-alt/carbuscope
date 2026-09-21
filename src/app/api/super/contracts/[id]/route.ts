import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { logAudit, serializeContract } from "@/lib/saas-server"

export const dynamic = "force-dynamic"

const VALID_STATUS = ["ESSAI", "ACTIF", "SUSPENDU", "RESILIE"]
const VALID_PLANS = ["ESSENTIEL", "PRO", "ENTERPRISE"]
const EDIT_KEYS = ["plan", "monthlyFee", "seats", "stationQuota", "renewsAt"] as const

/** Format montants pour l'audit : « 1 690 » / « 2 450,5 » */
function fmtAuditAmount(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v)
}

/** Format date pour l'audit : « 15 janv. 2026 » */
function fmtAuditDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

async function stationCountOf(brandSlug: string): Promise<number> {
  const brands = await db.brand.findMany({
    where: { slug: brandSlug },
    include: { _count: { select: { stations: true } } },
  })
  return brands[0]?._count.stations ?? 0
}

// PATCH /api/super/contracts/[id] — deux usages :
//  • {status} : changement de statut (suspension en cascade des comptes
//    utilisateurs de l'enseigne / réactivation qui les restaure) ;
//  • {plan | monthlyFee | seats | stationQuota | renewsAt} : édition du contrat
//    (champs optionnels, au moins un requis), journalisée en audit avec les
//    seuls champs réellement modifiés.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 })
  }

  const status = typeof body.status === "string" ? body.status : undefined
  const wantsEdit = EDIT_KEYS.some(k => body[k] !== undefined)

  if (status && wantsEdit) {
    return NextResponse.json(
      { error: "Le statut et les champs d'édition ne peuvent pas être modifiés dans la même requête" },
      { status: 400 }
    )
  }

  // ---------- 1) Édition du contrat (plan, tarif, sièges, quota, renouvellement) ----------
  if (wantsEdit) {
    const data: {
      plan?: string
      monthlyFee?: number
      seats?: number
      stationQuota?: number
      renewsAt?: Date
    } = {}
    const parts: string[] = []

    if (body.plan !== undefined) {
      if (typeof body.plan !== "string" || !VALID_PLANS.includes(body.plan)) {
        return NextResponse.json({ error: "Plan invalide (ESSENTIEL | PRO | ENTERPRISE)" }, { status: 400 })
      }
    }
    if (body.monthlyFee !== undefined) {
      const v = body.monthlyFee
      if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 100000) {
        return NextResponse.json(
          { error: "Tarif mensuel invalide — nombre entre 1 et 100 000 DT" },
          { status: 400 }
        )
      }
    }
    if (body.seats !== undefined) {
      const v = body.seats
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 500) {
        return NextResponse.json(
          { error: "Nombre de sièges invalide — entier entre 1 et 500" },
          { status: 400 }
        )
      }
    }
    if (body.stationQuota !== undefined) {
      const v = body.stationQuota
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5000) {
        return NextResponse.json(
          { error: "Quota de stations invalide — entier entre 1 et 5 000" },
          { status: 400 }
        )
      }
    }
    if (body.renewsAt !== undefined) {
      if (typeof body.renewsAt !== "string" || Number.isNaN(Date.parse(body.renewsAt))) {
        return NextResponse.json(
          { error: "Date de renouvellement invalide (date ISO attendue)" },
          { status: 400 }
        )
      }
    }

    const contract = await db.saasContract.findUnique({ where: { id } })
    if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 })

    // Ne journaliser/mettre à jour que les champs réellement changés.
    if (body.plan !== undefined && body.plan !== contract.plan) {
      data.plan = body.plan
      parts.push(`plan ${contract.plan} → ${body.plan}`)
    }
    if (body.monthlyFee !== undefined && body.monthlyFee !== contract.monthlyFee) {
      data.monthlyFee = body.monthlyFee
      parts.push(`tarif ${fmtAuditAmount(contract.monthlyFee)} → ${fmtAuditAmount(body.monthlyFee)} DT`)
    }
    if (body.seats !== undefined && body.seats !== contract.seats) {
      data.seats = body.seats
      parts.push(`sièges ${contract.seats} → ${body.seats}`)
    }
    if (body.stationQuota !== undefined && body.stationQuota !== contract.stationQuota) {
      data.stationQuota = body.stationQuota
      parts.push(`quota stations ${contract.stationQuota} → ${body.stationQuota}`)
    }
    if (body.renewsAt !== undefined) {
      const d = new Date(body.renewsAt)
      if (d.getTime() !== contract.renewsAt.getTime()) {
        data.renewsAt = d
        parts.push(`renouvellement ${fmtAuditDate(contract.renewsAt)} → ${fmtAuditDate(d)}`)
      }
    }

    if (Object.keys(data).length === 0) {
      // Aucun changement effectif : renvoyer le contrat sérialisé tel quel.
      const same = await db.saasContract.findUnique({ where: { id }, include: { invoices: true } })
      if (!same) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 })
      return NextResponse.json({ contract: serializeContract(same, await stationCountOf(same.brandSlug)) })
    }

    const updated = await db.saasContract.update({
      where: { id },
      data,
      include: { invoices: true },
    })

    await logAudit({
      kind: "CONTRAT",
      message: `Contrat ${contract.brandName} modifié : ${parts.join(", ")}`,
      actor: body?.actor,
      brandSlug: contract.brandSlug,
    })

    return NextResponse.json({
      contract: serializeContract(updated, await stationCountOf(contract.brandSlug)),
    })
  }

  // ---------- 2) Changement de statut (comportement historique) ----------
  if (!status || !VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: "Statut invalide (ESSAI | ACTIF | SUSPENDU | RESILIE)" }, { status: 400 })
  }

  const contract = await db.saasContract.findUnique({ where: { id } })
  if (!contract) return NextResponse.json({ error: "Contrat introuvable" }, { status: 404 })

  const updated = await db.saasContract.update({
    where: { id },
    data: { status },
    include: { invoices: true },
  })

  if (status === "SUSPENDU") {
    await db.user.updateMany({
      where: { brandSlug: contract.brandSlug, active: true },
      data: { active: false },
    })
  } else if (status === "ACTIF" && contract.status === "SUSPENDU") {
    await db.user.updateMany({
      where: { brandSlug: contract.brandSlug },
      data: { active: true },
    })
  }

  const stationCount = await stationCountOf(contract.brandSlug)

  await logAudit({
    kind: "CONTRAT",
    message: `Contrat « ${contract.brandName} » : ${contract.status} → ${status}`,
    actor: body?.actor,
    brandSlug: contract.brandSlug,
  })

  return NextResponse.json({ contract: serializeContract(updated, stationCount) })
}
