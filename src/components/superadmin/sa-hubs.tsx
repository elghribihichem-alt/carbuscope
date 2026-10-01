'use client'

// Super Administration — T54-Cb — volet « Mobility Hub » : supervision du
// réseau des Terminaux Multi-Services (module « Mobility Hub Operations »).
// LECTURE SEULE en V1 (documenté) : l'édition des hubs et des paramètres
// d'exploitation reste côté enseigne (volet « Paramètres TMP ») — la console
// SA agrège et observe. Données GET /api/hubs/supervision (réservé SUPER_ADMIN,
// pattern auth /api/radar/config — 401/403 sinon, AUCUNE dépendance à la
// session enseigne d'/api/hubs/analytics).
//   · KPIs réseau : hubs actifs, passages 90 j, taux de conversion global,
//     valeur générée ;
//   · mini entonnoir compact (reprend le visuel du volet enseigne) ;
//   · table des 9 hubs : code, nom, gouvernorat, statut, services actifs,
//     passages 90 j, taux (mini jauge), dernière MAJ des paramètres ;
//   · ligne → Sheet détail : fiche complète + entonnoir propre au hub ;
//   · bouton « Voir la carte TMP » : bascule vers l'espace portail enseigne
//     (pattern setMode("portail") + nav de sa-comptes — Rania est ADMIN, le
//     groupe « Mobility Hub Operations » lui est accessible).

import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight, Building2, Coins, Gauge, Heart, LocateFixed, Map, Radar,
  RefreshCw, Wrench,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState, Skeleton } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { num } from "@/lib/chart"
import { fmtDate, timeAgo } from "./sa-shared"
import {
  FUNNEL_STAGE_META, HUB_STATUS_META, HUB_TYPE_LABELS,
  dateFr, kdt, pctFr, priceFr,
  type HubSupervisionDTO,
} from "@/components/hubs/hub-shared"

/* ============================== Volet SA ============================== */

export function SaHubs() {
  const setMode = useAppStore(s => s.setMode)
  const setNav = useAppStore(s => s.setNav)

  const [data, setData] = useState<HubSupervisionDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sheetId, setSheetId] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/hubs/supervision", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error ?? `/api/hubs/supervision → ${r.status}`)
        }
        return (await r.json()) as HubSupervisionDTO
      })
      .then(d => {
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const sheetHub = useMemo(
    () => (data && sheetId ? data.hubs.find(h => h.id === sheetId) ?? null : null),
    [data, sheetId],
  )

  /* ---------- Rendus ---------- */

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }

  if (data === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la supervision Mobility Hub…">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const { kpis, funnel } = data
  const maxFunnel = funnel[0]?.count ?? 0

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Bandeau du volet ---- */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 shadow-sm dark:bg-orange-950 dark:text-orange-400"
              aria-hidden
            >
              <LocateFixed className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">Mobility Hub — supervision réseau</h2>
                <Badge
                  variant="outline"
                  className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                >
                  Lecture seule
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Vue consolidée des Terminaux Multi-Services sur 90 jours glissants : entonnoir de
                conversion, efficacité par hub et fraîcheur des paramètres d&apos;exploitation.
                L&apos;édition reste côté enseigne (volet « Paramètres TMP ») — V1.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 gap-1.5"
              onClick={() => setReloadKey(k => k + 1)}
              aria-label="Recharger la supervision"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Actualiser
            </Button>
            <Button
              className="h-11 gap-1.5"
              onClick={() => {
                // Pattern sa-comptes : bascule vers l'espace portail enseigne
                // (le compte racine Rania est ADMIN — le groupe « Mobility Hub
                // Operations » lui est accessible côté enseigne).
                setMode("portail")
                setNav("espace", "portail")
                setNav("portail", "hubs")
                setNav("hubs", "carte")
              }}
            >
              <Map className="h-4 w-4" aria-hidden /> Voir la carte TMP
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- KPIs réseau ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" aria-hidden /> Hubs actifs
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">
              {kpis.hubsActifs}
              <span className="text-base font-medium text-muted-foreground"> / {kpis.hubs}</span>
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {kpis.servicesTotal} services au catalogue
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" aria-hidden /> Passages 90 j
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{num(kpis.passages)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {num(kpis.conversions)} conversions (prestations)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Taux global
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{pctFr(kpis.tauxGlobal)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              du passage capteur à la prestation
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" aria-hidden /> Valeur générée
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums leading-none">{kdt(kpis.valeur)}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {num(kpis.fidelises)} clients fidélisés
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Mini entonnoir compact (visuel du volet enseigne, densifié) ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Entonnoir réseau (90 jours)</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Décroissance capteurs → visites → prestations → fidélisation, agrégée sur les 9 hubs.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {maxFunnel === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aucun événement capteur sur la période.
            </p>
          ) : (
            funnel.map(f => {
              const meta = FUNNEL_STAGE_META[f.stage]
              const width = maxFunnel > 0 ? Math.max(2, (f.count / maxFunnel) * 100) : 0
              return (
                <div
                  key={f.stage}
                  className="flex items-center gap-3"
                  role="img"
                  aria-label={`${meta?.label ?? f.stage} : ${num(f.count)} (${pctFr(f.rate)})`}
                >
                  <p className={`w-32 shrink-0 truncate text-xs font-semibold ${meta?.text ?? ""}`}>
                    {meta?.label ?? f.stage}
                  </p>
                  <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/50">
                    <div
                      className={`flex h-full items-center justify-end rounded-md pr-2 text-[10px] font-semibold text-white tabular-nums ${meta?.bar ?? "bg-zinc-400"}`}
                      style={{ width: `${width}%` }}
                    >
                      {num(f.count)} · {pctFr(f.rate)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* ---- Table de supervision des hubs ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Supervision des {data.hubs.length} hubs</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Cliquez sur une ligne pour la fiche détaillée (entonnoir propre au hub) — dernière
            colonne : fraîcheur des paramètres d&apos;exploitation (horaires/tarifs).
          </p>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border [scrollbar-width:thin]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-left">Code</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide">Hub</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide">Gouvernorat</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide">Statut</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">Services actifs</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">Passages 90 j</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">Taux</TableHead>
                  <TableHead className="h-10 text-[11px] uppercase tracking-wide text-right">MAJ paramètres</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hubs.map(h => {
                  const meta = HUB_STATUS_META[h.status]
                  const tauxCls =
                    h.taux >= 55
                      ? "bg-emerald-500"
                      : h.taux >= 35
                        ? "bg-amber-500"
                        : h.taux > 0
                          ? "bg-[var(--c-terra)]"
                          : "bg-zinc-300 dark:bg-zinc-700"
                  return (
                    <TableRow
                      key={h.id}
                      className="cursor-pointer"
                      onClick={() => setSheetId(h.id)}
                      aria-label={`Ouvrir la fiche de ${h.code}`}
                    >
                      <TableCell className="py-2.5 pl-3 font-mono text-[11px]">{h.code}</TableCell>
                      <TableCell className="max-w-[220px] truncate py-2.5 text-[13px] font-medium" title={h.name}>
                        {h.name}
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px]">{h.gouvernorat}</TableCell>
                      <TableCell className="py-2.5">
                        {meta ? (
                          <Badge variant="outline" className={`text-[11px] ${meta.badge}`}>
                            {meta.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]">{h.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-[13px] tabular-nums">
                        {h.activeServices > 0 ? `${h.activeServices} / ${h.totalServices}` : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right text-[13px] tabular-nums">
                        {h.passages > 0 ? num(h.passages) : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <span className="flex items-center justify-end gap-2" title="Conversions / passages (90 j)">
                          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <span
                              className={`block h-full rounded-full ${tauxCls}`}
                              style={{ width: `${Math.min(100, Math.round(h.taux))}%` }}
                            />
                          </span>
                          <span className="text-[13px] tabular-nums">
                            {h.passages > 0 ? pctFr(h.taux) : "—"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 pr-3 text-right text-[11px] text-muted-foreground">
                        {h.settingsUpdatedAt ? (
                          <span title={`${fmtDate(h.settingsUpdatedAt)}${h.settingsUpdatedBy ? ` · ${h.settingsUpdatedBy}` : ""}`}>
                            {timeAgo(h.settingsUpdatedAt)}
                          </span>
                        ) : (
                          "jamais"
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---- Sheet détail : fiche hub + entonnoir propre ---- */}
      <Sheet open={sheetHub != null} onOpenChange={o => { if (!o) setSheetId(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {sheetHub && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  <Map className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {sheetHub.code} — {sheetHub.name}
                </SheetTitle>
                <SheetDescription>
                  Fiche de supervision (lecture seule SA) — efficacité du hub sur 90 jours glissants.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <p className="col-span-2 text-muted-foreground">
                    <Building2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                    {sheetHub.address} · {sheetHub.gouvernorat}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Type : </span>
                    {HUB_TYPE_LABELS[sheetHub.type] ?? sheetHub.type}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Ouvert le : </span>
                    {dateFr(sheetHub.openedAt)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Surface : </span>
                    {sheetHub.surfaceM2 != null ? `${num(sheetHub.surfaceM2)} m²` : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Responsable : </span>
                    {sheetHub.manager ?? "—"}
                  </p>
                  <p className="col-span-2">
                    <span className="text-muted-foreground">Téléphone : </span>
                    {sheetHub.phone ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Trafic : </span>
                    {sheetHub.status === "PLANNED" ? "—" : `${num(sheetHub.dailyVehicles)} véh./j`}
                  </p>
                  <p>
                    <span className="text-muted-foreground">CA mensuel : </span>
                    {sheetHub.status === "PLANNED" ? "—" : priceFr(sheetHub.monthlyRevenue)}
                  </p>
                  <p className="col-span-2">
                    <span className="text-muted-foreground">Paramètres (horaires/tarifs) : </span>
                    {sheetHub.settingsUpdatedAt
                      ? `mis à jour ${timeAgo(sheetHub.settingsUpdatedAt)}${sheetHub.settingsUpdatedBy ? ` par ${sheetHub.settingsUpdatedBy}` : ""}`
                      : "jamais enregistrés"}
                  </p>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Wrench className="h-3 w-3" aria-hidden /> Services
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums">
                      {sheetHub.activeServices}
                      <span className="text-xs font-normal text-muted-foreground"> / {sheetHub.totalServices}</span>
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Gauge className="h-3 w-3" aria-hidden /> Passages
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{num(sheetHub.passages)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Coins className="h-3 w-3" aria-hidden /> Valeur
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{kdt(sheetHub.valeur)}</p>
                  </div>
                </div>

                {/* Entonnoir du hub (compact) */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Radar className="h-3.5 w-3.5" aria-hidden /> Entonnoir du hub (90 j)
                  </p>
                  {sheetHub.passages === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Aucun passage capteur — hub non ouvert ou sans mesure sur la période.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sheetHub.funnel.map(f => {
                        const meta = FUNNEL_STAGE_META[f.stage]
                        const width = sheetHub.passages > 0 ? Math.max(2, (f.count / sheetHub.passages) * 100) : 0
                        return (
                          <div
                            key={f.stage}
                            className="flex items-center gap-3"
                            role="img"
                            aria-label={`${meta?.label ?? f.stage} : ${num(f.count)} (${pctFr(f.rate)})`}
                          >
                            <p className={`w-28 shrink-0 truncate text-xs font-semibold ${meta?.text ?? ""}`}>
                              {meta?.label ?? f.stage}
                            </p>
                            <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted/50">
                              <div
                                className={`flex h-full items-center justify-end rounded-md pr-2 text-[10px] font-semibold text-white tabular-nums ${meta?.bar ?? "bg-zinc-400"}`}
                                style={{ width: `${width}%` }}
                              >
                                {num(f.count)} · {pctFr(f.rate)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Heart className="h-3 w-3" aria-hidden />
                        Taux global du hub : {pctFr(sheetHub.taux)} — conversions (prestations) /
                        passages.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
