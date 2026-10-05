'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Tableau de bord » :
//   · 3 KPI : panneaux actifs, faces, taux d'occupation global (pctFr) ;
//   · bandeau ambre « Autorisations expirant sous 30 jours » (clic → volet
//     panneaux via setNav("saMedia","panels")) ;
//   · table des 10 faces les plus vues (ODV) ;
//   · mini barres recharts par technologie (issues du top 10).
// Données : GET /api/media/dashboard (SA uniquement — scope "SA").

import { useMemo } from "react"
import { AlertTriangle, LayoutDashboard, PanelsTopLeft, Percent, SquareStack, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { ModuleHeader, FACE_STATUS_META, numFr, pctFr, dateFr } from "@/components/media/media-shared"
import { useSaMediaGet, useSaMediaT, daysLeft, type SaDashboardDTO } from "./sa-media/sa-media-shared"

const DICT = {
  fr: {
    header: "Vue d'ensemble du référentiel",
    headerDesc: "Panneaux actifs, faces enregistrées, occupation moyenne du réseau et échéances d'autorisations municipales.",
    "kpi.panels": "Panneaux actifs",
    "kpi.panelsSub": "statut ACTIF dans le référentiel",
    "kpi.faces": "Faces recensées",
    "kpi.facesSub": "toutes confondues (tous panneaux)",
    "kpi.occupancy": "Occupation moyenne",
    "kpi.occupancySub": "taux d'occupation 12 mois, toutes faces",
    "alert.title": "Autorisations expirant sous 30 jours",
    "alert.desc": "Panneaux dont l'autorisation municipale arrive à échéance — renouveler ou retirer du référentiel.",
    "alert.none": "Aucune autorisation n'expire dans les 30 prochains jours.",
    "alert.cta": "Traiter dans « Panneaux & faces »",
    "top.title": "10 faces les plus vues",
    "top.desc": "Classées par occasions de voir journalières (ODV/j) — statistiques d'exposition du réseau.",
    "top.code": "Code",
    "top.panel": "Panneau",
    "top.ville": "Ville",
    "top.format": "Format",
    "top.tech": "Technologie",
    "top.odv": "ODV/j",
    "top.audience": "Audience/j",
    "top.sov": "SOV",
    "top.occupancy": "Occupation",
    "top.status": "Statut",
    "chart.title": "Répartition du top 10 par technologie",
    "chart.desc": "ODV journalières cumulées par technologie d'affichage.",
    "chart.empty": "Aucune donnée à représenter.",
    legend: "Légende des cellules",
  },
  en: {
    header: "Referential overview",
    headerDesc: "Active panels, registered faces, average network occupancy and municipal authorization deadlines.",
    "kpi.panels": "Active panels",
    "kpi.panelsSub": "ACTIVE status in the referential",
    "kpi.faces": "Registered faces",
    "kpi.facesSub": "all panels combined",
    "kpi.occupancy": "Average occupancy",
    "kpi.occupancySub": "12-month occupancy rate, all faces",
    "alert.title": "Authorizations expiring within 30 days",
    "alert.desc": "Panels whose municipal authorization is running out — renew or remove from the referential.",
    "alert.none": "No authorization expiring in the next 30 days.",
    "alert.cta": "Handle in “Panels & faces”",
    "top.title": "Top 10 most viewed faces",
    "top.desc": "Ranked by daily opportunities to see (ODV/day) — network exposure statistics.",
    "top.code": "Code",
    "top.panel": "Panel",
    "top.ville": "City",
    "top.format": "Format",
    "top.tech": "Technology",
    "top.odv": "ODV/day",
    "top.audience": "Audience/day",
    "top.sov": "SOV",
    "top.occupancy": "Occupancy",
    "top.status": "Status",
    "chart.title": "Top 10 split by technology",
    "chart.desc": "Cumulated daily ODV by display technology.",
    "chart.empty": "No data to plot.",
    legend: "Cell legend",
  },
  ar: {
    header: "نظرة عامة على المرجع",
    headerDesc: "اللوحات النشطة والأوجه المسجلة ومعدل الإشغال متوسط الشبكة ومواعيد تراخيص البلديات.",
    "kpi.panels": "لوحات نشطة",
    "kpi.panelsSub": "حالة نشط في المرجع",
    "kpi.faces": "أوجه مسجلة",
    "kpi.facesSub": "كل اللوحات مجتمعة",
    "kpi.occupancy": "متوسط الإشغال",
    "kpi.occupancySub": "معدل الإشغال 12 شهرًا لكل الأوجه",
    "alert.title": "تراخيص تنتهي خلال 30 يومًا",
    "alert.desc": "لوحات تنتهي تراخيصها البلدية قريبًا — يجب تجديدها أو سحبها من المرجع.",
    "alert.none": "لا تراخيص تنتهي خلال 30 يومًا.",
    "alert.cta": "المعالجة في «اللوحات والأوجه»",
    "top.title": "أكثر 10 أوجه مشاهدة",
    "top.desc": "مرتبة حسب فرص الرؤية اليومية (ODV/يوم).",
    "top.code": "الرمز",
    "top.panel": "اللوحة",
    "top.ville": "المدينة",
    "top.format": "الصيغة",
    "top.tech": "التقنية",
    "top.odv": "ODV/يوم",
    "top.audience": "الجمهور/يوم",
    "top.sov": "SOV",
    "top.occupancy": "الإشغال",
    "top.status": "الحالة",
    "chart.title": "توزيع العشرة الأوائل حسب التقنية",
    "chart.desc": "إجمالي ODV اليومي حسب تقنية العرض.",
    "chart.empty": "لا توجد بيانات.",
    legend: "مفتاح الخلايا",
  },
}

// Couleurs graphiques (émeraude / ambre / terracotta / zinc — pas de bleu).
const TECH_COLORS = ["#059669", "#d97706", "#b0563b", "#5f6f64", "#a1a1aa", "#3f6212"]

export function SaMediaDashboard() {
  const { t } = useSaMediaT(DICT)
  const setNav = useAppStore(s => s.setNav)
  const { data, error, loading, reload } = useSaMediaGet<SaDashboardDTO>("/api/media/dashboard")

  const byTech = useMemo(() => {
    if (!data) return []
    const m = new Map<string, number>()
    for (const f of data.topFaces) m.set(f.technology, (m.get(f.technology) ?? 0) + f.odv)
    return [...m.entries()]
      .map(([tech, odv]) => ({ tech, odv }))
      .sort((a, b) => b.odv - a.odv)
  }, [data])

  if (error !== null) return <ErrorState message={error} retry={reload} />

  if (loading || data === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const { kpis, topFaces, expiring } = data

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={LayoutDashboard} title={t("header")} description={t("headerDesc")} />

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden /> {t("kpi.panels")}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{numFr(kpis.panels)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("kpi.panelsSub")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <SquareStack className="h-3.5 w-3.5" aria-hidden /> {t("kpi.faces")}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{numFr(kpis.faces)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("kpi.facesSub")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Percent className="h-3.5 w-3.5" aria-hidden /> {t("kpi.occupancy")}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{pctFr(kpis.occupancy)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("kpi.occupancySub")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Alerte 30 jours ---- */}
      <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40">
        <CardHeader className="gap-1.5 pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0" aria-hidden /> {t("alert.title")}
            <Badge variant="outline" className="ml-auto border-amber-300 bg-white/70 text-amber-700 dark:border-amber-700 dark:bg-transparent dark:text-amber-300">
              {expiring.length}
            </Badge>
          </CardTitle>
          <p className="text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/80">{t("alert.desc")}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {expiring.length === 0 ? (
            <p className="rounded-lg border border-dashed border-amber-300/70 p-3 text-center text-sm text-muted-foreground dark:border-amber-800/70">
              {t("alert.none")}
            </p>
          ) : (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {expiring.map(p => {
                const dl = daysLeft(p.authorizationEnd)
                return (
                  <li key={p.code}>
                    <button
                      type="button"
                      onClick={() => setNav("saMedia", "panels")}
                      className="flex w-full min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-left transition-colors hover:border-amber-400 hover:bg-amber-100/70 dark:border-amber-900 dark:bg-zinc-900/70 dark:hover:border-amber-600 dark:hover:bg-amber-900/40"
                      aria-label={`${p.code} — ${t("alert.cta")}`}
                    >
                      <span className="font-mono text-xs font-bold text-amber-900 dark:text-amber-200">{p.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.ville}</span>
                      <span className="text-xs tabular-nums text-amber-800 dark:text-amber-300">
                        {dateFr(p.authorizationEnd)}
                        {dl !== null ? ` · ${dl < 0 ? "expirée" : `J-${dl}`}` : ""}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {expiring.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-amber-300 bg-white/80 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-700 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-900/50"
              onClick={() => setNav("saMedia", "panels")}
            >
              {t("alert.cta")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---- Top 10 faces ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {t("top.title")}
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("top.desc")}</p>
        </CardHeader>
        <CardContent>
          {topFaces.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("common.empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-28">{t("top.code")}</TableHead>
                    <TableHead className="min-w-40">{t("top.panel")}</TableHead>
                    <TableHead className="min-w-24">{t("top.ville")}</TableHead>
                    <TableHead>{t("top.format")}</TableHead>
                    <TableHead>{t("top.tech")}</TableHead>
                    <TableHead className="text-right">{t("top.odv")}</TableHead>
                    <TableHead className="text-right">{t("top.audience")}</TableHead>
                    <TableHead className="text-right">{t("top.sov")}</TableHead>
                    <TableHead className="text-right">{t("top.occupancy")}</TableHead>
                    <TableHead>{t("top.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topFaces.map((f, i) => {
                    const meta = FACE_STATUS_META[f.status]
                    return (
                      <TableRow key={f.code} className={i < 3 ? "bg-emerald-50/40 dark:bg-emerald-950/20" : undefined}>
                        <TableCell className="font-mono text-xs font-semibold">{f.code}</TableCell>
                        <TableCell className="max-w-44 truncate text-sm" title={f.panel}>{f.panel}</TableCell>
                        <TableCell className="text-sm">{f.ville}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.format}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.technology}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{numFr(f.odv)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{numFr(f.audience)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{pctFr(f.sov)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{pctFr(f.occupancy)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta?.className ?? ""}>{meta?.label ?? f.status}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Mini barres par technologie ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("chart.title")}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("chart.desc")}</p>
        </CardHeader>
        <CardContent>
          {byTech.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("chart.empty")}</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTech} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
                  <XAxis dataKey="tech" tick={{ fontSize: 11 }} stroke="currentColor" className="text-zinc-500" />
                  <YAxis tickFormatter={(v: number) => numFr(v)} tick={{ fontSize: 11 }} width={56} stroke="currentColor" className="text-zinc-500" />
                  <Tooltip
                    formatter={(v: number) => [numFr(v), "ODV/j"]}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{ borderRadius: "0.625rem", fontSize: 12 }}
                  />
                  <Bar dataKey="odv" radius={[6, 6, 0, 0] as [number, number, number, number]} barSize={28}>
                    {byTech.map((_, i) => (
                      <Cell key={i} fill={TECH_COLORS[i % TECH_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
