'use client'

// CarbuScope — T60-e — Tableau de bord Média (Portail enseigne) : 4 KPIs
// (campagnes actives, budget consommé, stations couvertes, faces visibles
// avec sous-compte accès complet / restreint), campagnes actives (nom,
// période, budget, « Ouvrir » → volet Simulations), faces marquantes (top
// audience en accès complet — table compacte avec badge statut + prix/semaine)
// et bouton « Explorer le réseau » (prop onExplore de media-module). Données
// GET /api/media/dashboard (scope ENSEIGNE, périmètre du cookie de session) —
// skeletons au chargement, état erreur + Réessayer, états vides honnêtes.

import { useEffect, useState } from "react"
import {
  CalendarRange, Coins, Layers, MapPin, Megaphone, RotateCcw, TriangleAlert, Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { apiJson, dateFr, dtFr, numFr, useLocalT, type LocalDict } from "@/components/media/media-shared"
import { FACE_STATUS_META } from "@/components/media/media-shared"
import { useAppStore } from "@/store/app-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

const D_DICT: LocalDict = {
  fr: {
    "db.error": "Erreur de chargement",
    "db.retry": "Réessayer",
    "db.kpi.active": "Campagnes actives",
    "db.kpi.activeSub": "simulations envoyées en cours",
    "db.kpi.budget": "Budget consommé",
    "db.kpi.budgetSub": "cumul des campagnes envoyées",
    "db.kpi.stations": "Stations couvertes",
    "db.kpi.stationsSub": "à ≤ 1 km d'une face visible",
    "db.kpi.faces": "Faces visibles",
    "db.kpi.facesSub": "dans votre périmètre",
    "db.kpi.full": "accès complet",
    "db.kpi.restricted": "restreint",
    "db.campaigns.title": "Campagnes actives",
    "db.campaigns.empty": "Aucune campagne active pour l'instant.",
    "db.campaigns.emptyHint": "Créez une simulation, sélectionnez vos faces puis envoyez-la en diffusion.",
    "db.campaigns.open": "Ouvrir",
    "db.campaigns.budget": "Budget",
    "db.campaigns.none": "aucun budget calculé",
    "db.top.title": "Faces marquantes",
    "db.top.desc": "Les faces en accès complet aux plus fortes audiences journalières de votre périmètre.",
    "db.top.empty": "Aucune face en accès complet dans votre périmètre.",
    "db.top.audience": "Audience/j",
    "db.top.odv": "ODV/j",
    "db.top.prix": "Prix/sem.",
    "db.top.ville": "Ville",
    "db.top.format": "Format",
    "db.top.code": "Face",
    "db.top.statut": "Statut",
    "db.explore": "Explorer le réseau",
    "db.newSim": "Créer une simulation",
  },
  en: {
    "db.error": "Loading error",
    "db.retry": "Retry",
    "db.kpi.active": "Active campaigns",
    "db.kpi.activeSub": "sent simulations in flight",
    "db.kpi.budget": "Consumed budget",
    "db.kpi.budgetSub": "cumulated sent campaigns",
    "db.kpi.stations": "Covered stations",
    "db.kpi.stationsSub": "within ≤ 1 km of a visible face",
    "db.kpi.faces": "Visible faces",
    "db.kpi.facesSub": "in your perimeter",
    "db.kpi.full": "full access",
    "db.kpi.restricted": "restricted",
    "db.campaigns.title": "Active campaigns",
    "db.campaigns.empty": "No active campaign yet.",
    "db.campaigns.emptyHint": "Create a simulation, pick your faces then send it live.",
    "db.campaigns.open": "Open",
    "db.campaigns.budget": "Budget",
    "db.campaigns.none": "no computed budget",
    "db.top.title": "Standout faces",
    "db.top.desc": "Highest daily audiences among full-access faces in your perimeter.",
    "db.top.empty": "No full-access face in your perimeter.",
    "db.top.audience": "Audience/d",
    "db.top.odv": "DVN/d",
    "db.top.prix": "Price/wk",
    "db.top.ville": "City",
    "db.top.format": "Format",
    "db.top.code": "Face",
    "db.top.statut": "Status",
    "db.explore": "Explore the network",
    "db.newSim": "Create a simulation",
  },
  ar: {
    "db.error": "خطأ في التحميل",
    "db.retry": "إعادة المحاولة",
    "db.kpi.active": "حملات نشطة",
    "db.kpi.activeSub": "محاكات مُرسلة جارية",
    "db.kpi.budget": "الميزانية المستهلكة",
    "db.kpi.budgetSub": "مجموع الحملات المُرسلة",
    "db.kpi.stations": "محطات مغطاة",
    "db.kpi.stationsSub": "على بعد ≤ 1 كم من وجه مرئي",
    "db.kpi.faces": "أوجه مرئية",
    "db.kpi.facesSub": "في نطاقك",
    "db.kpi.full": "وصول كامل",
    "db.kpi.restricted": "مقيّد",
    "db.campaigns.title": "الحملات النشطة",
    "db.campaigns.empty": "لا حملات نشطة بعد.",
    "db.campaigns.emptyHint": "أنشئ محاكاة، اختر أوجهك ثم أرسلها للبث.",
    "db.campaigns.open": "فتح",
    "db.campaigns.budget": "الميزانية",
    "db.campaigns.none": "لا ميزانية محسوبة",
    "db.top.title": "أوجه بارزة",
    "db.top.desc": "أعلى الجمهور اليومي بين الأوجه بوصول كامل في نطاقك.",
    "db.top.empty": "لا وجه بوصول كامل في نطاقك.",
    "db.top.audience": "الجمهور/يوم",
    "db.top.odv": "فرص الرؤية/يوم",
    "db.top.prix": "السعر/أسبوع",
    "db.top.ville": "المدينة",
    "db.top.format": "المقاس",
    "db.top.code": "الوجه",
    "db.top.statut": "الحالة",
    "db.explore": "استكشاف الشبكة",
    "db.newSim": "إنشاء محاكاة",
  },
}

interface DashboardResponse {
  scope: string
  kpis: {
    visible: number
    full: number
    aggrege: number
    active: number
    budgetConsomme: number
    stationsCouvertes: number
  }
  activeCampaigns: { id: string; name: string; dateStart: string | null; dateEnd: string | null; budget: number | null }[]
  topFaces: { code: string; ville: string; format: string; audience: number; odv: number; prix: number; status: string }[]
}

export function MediaDashboard({ brandSlug, onExplore }: { brandSlug: string; onExplore: () => void }) {
  const { t } = useLocalT(D_DICT)
  const setNav = useAppStore(s => s.setNav)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Remise à zéro de l'erreur au rechargement : pattern « ajustement au
  // rendu » (setState gardé — pas de setState synchrone dans l'effet).
  const [lastReload, setLastReload] = useState(reloadKey)
  if (reloadKey !== lastReload) {
    setLastReload(reloadKey)
    setError(null)
  }

  useEffect(() => {
    const ctrl = new AbortController()
    apiJson<DashboardResponse>("/api/media/dashboard", { signal: ctrl.signal })
      .then(d => { setData(d); setError(null) })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey, brandSlug])

  // brandSlug est porté par le cookie de session — la prop ne sert qu'au rechargement.
  void brandSlug

  const openSimulations = () => setNav("media", "simulations")

  if (error !== null && data === null) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">{t("db.error")}</p>
            <p className="text-sm text-red-600/90 dark:text-red-400/80">{error}</p>
          </div>
          <Button variant="outline" className="h-11 gap-2 text-sm" onClick={() => setReloadKey(k => k + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> {t("db.retry")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (data === null) {
    // Skeleton : 4 KPIs + 2 sections
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl lg:col-span-3" />
        </div>
      </div>
    )
  }

  const k = data.kpis

  return (
    <div className="min-w-0 space-y-4">
      {/* — 4 KPI cards — */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Megaphone className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> {t("db.kpi.active")}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{numFr(k.active)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("db.kpi.activeSub")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-[#b0563b]" aria-hidden /> {t("db.kpi.budget")}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{dtFr(k.budgetConsomme)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("db.kpi.budgetSub")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-amber-600" aria-hidden /> {t("db.kpi.stations")}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{numFr(k.stationsCouvertes)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("db.kpi.stationsSub")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> {t("db.kpi.faces")}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{numFr(k.visible)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">{numFr(k.full)} {t("db.kpi.full")}</span>
              {" · "}
              <span className="text-amber-600 dark:text-amber-400">{numFr(k.aggrege)} {t("db.kpi.restricted")}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* — Campagnes actives — */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4 text-[#b0563b]" aria-hidden /> {t("db.campaigns.title")}
              {data.activeCampaigns.length > 0 && (
                <Badge variant="secondary" className="tabular-nums text-[10px]">{data.activeCampaigns.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.activeCampaigns.length === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">{t("db.campaigns.empty")}</p>
                <p className="text-xs text-muted-foreground/80">{t("db.campaigns.emptyHint")}</p>
                <Button variant="outline" className="h-11 w-full gap-2 text-sm" onClick={openSimulations}>
                  <Coins className="h-4 w-4" aria-hidden /> {t("db.newSim")}
                </Button>
              </div>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label={t("db.campaigns.title")}>
                {data.activeCampaigns.map(c => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</p>
                      <Button
                        variant="outline"
                        className="h-11 shrink-0 gap-1.5 px-3 text-xs"
                        onClick={openSimulations}
                        aria-label={`${t("db.campaigns.open")} — ${c.name}`}
                      >
                        {t("db.campaigns.open")}
                      </Button>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{dateFr(c.dateStart)} → {dateFr(c.dateEnd)}</span>
                      <span aria-hidden>·</span>
                      <span className="font-medium">
                        {t("db.campaigns.budget")} : {c.budget !== null ? dtFr(c.budget) : t("db.campaigns.none")}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Button className="h-11 w-full gap-2 bg-[#b0563b] text-white hover:bg-[#96482f]" onClick={onExplore}>
              <MapPin className="h-4 w-4" aria-hidden /> {t("db.explore")}
            </Button>
          </CardContent>
        </Card>

        {/* — Faces marquantes (top audience, accès complet) — */}
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("db.top.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("db.top.desc")}</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {data.topFaces.length === 0 ? (
              <p className="m-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("db.top.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 text-[11px]">{t("db.top.code")}</TableHead>
                      <TableHead className="h-9 text-[11px]">{t("db.top.ville")}</TableHead>
                      <TableHead className="h-9 text-[11px]">{t("db.top.format")}</TableHead>
                      <TableHead className="h-9 text-right text-[11px]">{t("db.top.audience")}</TableHead>
                      <TableHead className="h-9 text-right text-[11px]">{t("db.top.odv")}</TableHead>
                      <TableHead className="h-9 text-right text-[11px]">{t("db.top.prix")}</TableHead>
                      <TableHead className="h-9 text-[11px]">{t("db.top.statut")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topFaces.map(f => {
                      const meta = FACE_STATUS_META[f.status]
                      return (
                        <TableRow key={f.code}>
                          <TableCell className="py-2 font-mono text-[12px] font-medium">{f.code}</TableCell>
                          <TableCell className="py-2 text-[13px]">{f.ville}</TableCell>
                          <TableCell className="py-2 text-[13px] text-muted-foreground">{f.format}</TableCell>
                          <TableCell className="py-2 text-right text-[13px] font-semibold tabular-nums">
                            {numFr(f.audience)}
                          </TableCell>
                          <TableCell className="py-2 text-right text-[13px] tabular-nums">{numFr(f.odv)}</TableCell>
                          <TableCell className="py-2 text-right text-[13px] tabular-nums">{dtFr(f.prix)}</TableCell>
                          <TableCell className="py-2">
                            {meta
                              ? <Badge variant="outline" className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
                              : <Badge variant="outline" className="text-[10px]">{f.status}</Badge>}
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
      </div>

      {/* — Bandeau « données périmées » si un rechargement a échoué après un succès — */}
      {error !== null && data !== null && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4" aria-hidden /> {error}
            </p>
            <Button variant="outline" className="h-11 gap-2 text-xs" onClick={() => setReloadKey(k => k + 1)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {t("db.retry")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
