import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const TYPE_LABELS: Record<string, string> = {
  CONCURRENCE: "Analyse concurrentielle",
  IMPLANTATION: "Potentiel d'implantation",
  PERFORMANCE: "Performance réseau",
  VEILLE: "Veille",
}

export async function GET() {
  const reports = await db.report.findMany({ orderBy: { createdAt: "desc" }, take: 40 })
  return NextResponse.json({
    reports: reports.map(r => ({
      id: r.id, name: r.name, type: r.type, period: r.period, scope: r.scope, format: r.format,
      status: r.status, generatedBy: r.generatedBy, sizeKb: r.sizeKb, createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const type = String(body?.type ?? "VEILLE")
  const period = String(body?.period ?? "Période courante")
  const scope = String(body?.scope ?? "National")
  const format = String(body?.format ?? "PDF")
  const report = await db.report.create({
    data: {
      name: `${TYPE_LABELS[type] ?? "Rapport"} — ${scope} (${period})`,
      type, period, scope, format,
      generatedBy: String(body?.generatedBy ?? "Utilisateur CarbuScope"),
      sizeKb: 800 + Math.floor(Math.random() * 5200),
      status: "GENERATED",
    },
  })
  return NextResponse.json({
    report: {
      id: report.id, name: report.name, type: report.type, period: report.period, scope: report.scope,
      format: report.format, status: report.status, generatedBy: report.generatedBy,
      sizeKb: report.sizeKb, createdAt: report.createdAt.toISOString(),
    },
  }, { status: 201 })
}
