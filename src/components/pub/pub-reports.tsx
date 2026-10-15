"use client"

// CarbuScope — T58 — Publicité, sous-menu 3 « Rapports » : la page qui
// affiche TOUS LES RAPPORTS des campagnes publicitaires de l'enseigne
// (GET /api/pub/campaigns — scopage enseigne, SA voit tout). Chaque
// campagne enregistrée depuis le simulateur produit un rapport complet :
//   · en-tête : nom, objectif, période, statut, auteur, date ;
//   · KPI : budget estimé vs cible, contacts, portée nette, fréquence,
//     GRP, CPM ;
//   · décomposition : mix par mode (parts budget/contacts), supports du
//     snapshot (code, mode, régie, gouvernorat, coût, contacts) ;
//   · export CSV du rapport complet (downloadPubCampaignCsv) ;
//   · T59 (P2 cycle de vie) : statuts colorés SIMULEE → VALIDEE → EN_COURS
//     → TERMINEE (+ ANNULEE), timeline par campagne, actions Valider /
//     Lancer / Clôturer / Annuler (PATCH audité, transitions serveur) et
//     export PDF (socle report-pdf.ts — même gabarit que Radar/Shadow).
// Rechargement à l'ouverture du volet (Radix remonte le contenu).

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FileText, ChevronDown, Download, RotateCcw, Coins, Users, Target,
  Gauge, Calculator, Megaphone, CalendarRange, CircleCheck, Layers, Wallet,
  CircleDashed, CheckCircle2, PlayCircle, Archive, XCircle, FileDown, Loader2, Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  type PubCampaignDTO, pubObjectifLabel, pubPeriodeLabel, pubModeMeta,
  pubSupportLabel, formatTnd, formatNum, formatDateFr, downloadPubCampaignCsv,
  downloadPubCampaignPdf, downloadPubPortfolioPdf, pubCampagneStatutMeta,
  PUB_CAMPAGNE_ACTIONS,
} from "./pub-shared"

type ActionId = "valider" | "lancer" | "terminer" | "annuler"

export function PubReports() {
  const [campaigns, setCampaigns] = useState<PubCampaignDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  /** Busy par campagne+action — un seul appel en vol à la fois. */
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/pub/campaigns", { signal: ac.signal })
      .then(async r => {
        if (ac.signal.aborted) return
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null
          setError(body?.error ?? "Les rapports sont indisponibles — réessayez dans un instant.")
          setCampaigns([])
          return
        }
        const data = (await r.json()) as { campaigns?: PubCampaignDTO[] }
        setCampaigns(data.campaigns ?? [])
        setError(null)
      })
      .catch(err => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return
        setError("Service injoignable — vérifiez votre connexion, puis rechargez la page.")
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [])

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/pub/campaigns")
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as { campaigns?: PubCampaignDTO[] }
        setCampaigns(data.campaigns ?? [])
        setError(null)
      })
      .catch(() => setError("Rechargement impossible — réessayez dans un instant."))
      .finally(() => setLoading(false))
  }, [])

  // KPIs globaux du portefeuille de campagnes.
  const totaux = useMemo(() => ({
    nb: campaigns.length,
    budget: campaigns.reduce((s, c) => s + c.budgetEstime, 0),
    contacts: campaigns.reduce((s, c) => s + c.contactsBruts, 0),
  }), [campaigns])

  /** Répartition par statut du cycle de vie (barre du portefeuille). */
  const parStatut = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of campaigns) m.set(c.statut, (m.get(c.statut) ?? 0) + 1)
    return m
  }, [campaigns])

  /** PATCH /api/pub/campaigns?id= — transition audité, puis mise à jour
   *  optimiste du state (le serveur renvoie la campagne à jour). */
  const transition = useCallback(async (c: PubCampaignDTO, action: ActionId) => {
    const key = `${c.id}:${action}`
    if (busy) return
    setBusy(key)
    try {
      const r = await fetch(`/api/pub/campaigns?id=${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const body = (await r.json().catch(() => null)) as { campaign?: PubCampaignDTO; error?: string } | null
      if (!r.ok || !body?.campaign) {
        toast.error(body?.error ?? "Transition refusée — réessayez.")
        return
      }
      setCampaigns(prev => prev.map(x => (x.id === c.id ? { ...x, statut: body.campaign!.statut } : x)))
      toast.success(`Campagne « ${c.nom} » — ${pubCampagneStatutMeta(body.campaign.statut).label.toLowerCase()}.`)
    } catch {
      toast.error("Service injoignable — la transition n'a pas été appliquée.")
    } finally {
      setBusy(null)
    }
  }, [busy])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-[var(--c-terra)]/60">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm font-semibold text-[var(--c-terra)]">Impossible de charger les rapports</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11 gap-1.5" onClick={reload}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- En-tête + KPIs du portefeuille ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="min-w-0 lg:col-span-1">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden>
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-tight">Rapports des campagnes</h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {campaigns.length === 0
                  ? "Aucune campagne enregistrée pour l'instant."
                  : `${campaigns.length} campagne${campaigns.length > 1 ? "s" : ""} — simulations archivées avec snapshot des supports.`}
              </p>
            </div>
          </CardContent>
        </Card>
        {campaigns.length > 0 && (
          <>
            <KpiCard icon={Megaphone} label="Campagnes enregistrées" value={formatNum(totaux.nb)} />
            <KpiCard icon={Coins} label="Budget cumulé estimé" value={formatTnd(totaux.budget)} />
            <KpiCard icon={Users} label="Contacts cumulés" value={formatNum(totaux.contacts)} />
          </>
        )}
      </div>

      {/* ---- T59 : barre du cycle de vie du portefeuille ---- */}
      {campaigns.length > 0 && (
        <Card className="min-w-0">
          <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Cycle de vie
            </span>
            {["SIMULEE", "VALIDEE", "EN_COURS", "TERMINEE", "ANNULEE"].map(st => {
              const meta = pubCampagneStatutMeta(st)
              const n = parStatut.get(st) ?? 0
              if (n === 0) return null
              return (
                <span key={st} className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} aria-hidden />
                  {meta.label}
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{n}</span>
                </span>
              )
            })}
            <span className="ml-auto hidden text-[11px] text-muted-foreground md:inline">
              Transitions auditées — estimation serveur inchangée, snapshot supports conservé.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 gap-1.5 text-xs md:ml-0"
              onClick={() => {
                downloadPubPortfolioPdf(campaigns, "volet Rapports")
                toast(`Export PDF du portefeuille : ${campaigns.length} campagne${campaigns.length > 1 ? "s" : ""}.`)
              }}
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden /> Portefeuille (PDF)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- État vide : orienter vers le simulateur ---- */}
      {campaigns.length === 0 && (
        <Card className="min-w-0">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
              <FileText className="h-7 w-7" />
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Les rapports apparaissent ici dès qu&apos;une campagne est enregistrée depuis le
              « Simulateur publicitaire » : cadrage, estimation complète et supports choisis sont
              archivés dans un rapport consultable et exportable.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---- Un rapport par campagne (dépliable) ---- */}
      {campaigns.map(c => {
        const open = openId === c.id
        const depasse = c.budgetEstime > c.budgetCible
        const statutMeta = pubCampagneStatutMeta(c.statut)
        const actions = PUB_CAMPAGNE_ACTIONS[c.statut] ?? []
        const budgetMensuel = c.supports.reduce((s, p) => s + p.coutMensuel, 0)
        const parMode = [...new Map(c.supports.map(s => [s.mode, s.mode])).values()]
          .map(mode => {
            const sups = c.supports.filter(s => s.mode === mode)
            return {
              mode,
              nb: sups.length,
              budget: sups.reduce((s, p) => s + p.coutMensuel, 0),
              contacts: sups.reduce((s, p) => s + p.contactsJ, 0),
            }
          })
          .sort((a, b) => b.budget - a.budget)
        return (
          <Card key={c.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : c.id)}
              aria-expanded={open}
              className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden>
                  <Megaphone className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold">{c.nom}</span>
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                      {pubObjectifLabel(c.objectif)}
                    </Badge>
                    <Badge variant="outline" className={cn("gap-1.5 text-[10px]", statutMeta.badge)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", statutMeta.dot)} aria-hidden />
                      {statutMeta.label}
                    </Badge>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-muted-foreground">
                    <span>{formatDateFr(c.createdAt)}</span>
                    <span aria-hidden>·</span>
                    <span>{pubPeriodeLabel(c.periode)} ×{c.facteur.toLocaleString("fr-FR")}</span>
                    <span aria-hidden>·</span>
                    <span>{c.semaines} semaine{c.semaines > 1 ? "s" : ""}</span>
                    <span aria-hidden>·</span>
                    <span>{c.supports.length} supports</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">{formatTnd(c.budgetEstime)}</span>
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={cn(
                  "hidden text-xs font-semibold tabular-nums sm:inline",
                  depasse ? "text-[var(--c-terra)]" : "text-emerald-700 dark:text-emerald-400",
                )}>
                  {formatTnd(c.budgetEstime)} / {formatTnd(c.budgetCible)}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} aria-hidden />
              </span>
            </button>

            {open && (
              <div className="border-t px-4 py-4">
                {/* KPI du rapport */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  <KpiCard icon={Coins} label="Budget estimé" value={formatTnd(c.budgetEstime)} tone={depasse ? "terra" : "emerald"} />
                  <KpiCard icon={Wallet} label="Budget cible" value={formatTnd(c.budgetCible)} />
                  <KpiCard icon={Users} label="Contacts bruts" value={formatNum(c.contactsBruts)} />
                  <KpiCard icon={Target} label="Portée nette" value={formatNum(c.porteeNette)} />
                  <KpiCard icon={Gauge} label="GRP" value={c.grp > 0 ? c.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"} />
                  <KpiCard icon={Calculator} label="CPM" value={c.cpm > 0 ? `${c.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} DT` : "—"} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Mix par mode */}
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <h4 className="flex items-center gap-2 text-xs font-bold">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Mix par mode
                    </h4>
                    <div className="mt-2 space-y-2">
                      {parMode.map(m => {
                        const meta = pubModeMeta(m.mode)
                        const pct = budgetMensuel > 0 ? (m.budget / budgetMensuel) * 100 : 0
                        return (
                          <div key={m.mode}>
                            <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
                              <span className="flex items-center gap-1.5 font-medium">
                                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                                {meta.label} · {m.nb}
                              </span>
                              <span className="tabular-nums text-muted-foreground">{formatTnd(m.budget)}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                      Fréquence {c.frequence.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× ·
                      période {pubPeriodeLabel(c.periode)} (×{c.facteur.toLocaleString("fr-FR")}) ·
                      auteur {c.auteur}
                    </p>
                  </div>

                  {/* Supports du snapshot */}
                  <div className="lg:col-span-2">
                    <h4 className="flex items-center gap-2 text-xs font-bold">
                      <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      Supports de la campagne ({c.supports.length})
                    </h4>
                    <div className="mt-2 max-h-56 overflow-auto rounded-xl border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-[var(--c-paper)] dark:bg-zinc-900">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-[130px]">Code</TableHead>
                            <TableHead className="hidden sm:table-cell">Type</TableHead>
                            <TableHead className="hidden md:table-cell">Régie</TableHead>
                            <TableHead className="hidden lg:table-cell">Gouvernorat</TableHead>
                            <TableHead className="text-right">Coût/mois</TableHead>
                            <TableHead className="text-right">Contacts/j</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.supports.map(s => (
                            <TableRow key={s.code}>
                              <TableCell className="font-mono text-[11.5px]">{s.code}</TableCell>
                              <TableCell className="hidden sm:table-cell text-[12px]">{pubSupportLabel(s.supportType)}</TableCell>
                              <TableCell className="hidden md:table-cell text-[12px] text-muted-foreground">{s.regie}</TableCell>
                              <TableCell className="hidden lg:table-cell text-[12px] text-muted-foreground">{s.gouvernorat}</TableCell>
                              <TableCell className="text-right tabular-nums text-[12px]">{formatTnd(s.coutMensuel)}</TableCell>
                              <TableCell className="text-right tabular-nums text-[12px]">{formatNum(s.contactsJ)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => { downloadPubCampaignCsv(c); toast(`Export CSV du rapport « ${c.nom} ».`) }}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden /> Exporter le rapport (CSV)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => { downloadPubCampaignPdf(c); toast(`PDF du rapport « ${c.nom} » en préparation.`) }}
                      >
                        <FileDown className="h-3.5 w-3.5" aria-hidden /> PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={reload}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Rafraîchir
                      </Button>
                    </div>

                    {/* ---- T59 : cycle de vie — timeline + actions ---- */}
                    <div className="mt-3 rounded-xl border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-xs font-bold">
                          <CircleCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          Cycle de vie de la campagne
                        </h4>
                        <span className="text-[11px] leading-snug text-muted-foreground">{statutMeta.description}</span>
                      </div>
                      <TimelineStatut statut={c.statut} />
                      {actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {actions.map(a => {
                            const key = `${c.id}:${a.action}`
                            const enCours = busy === key
                            const Icone = a.action === "valider" ? CheckCircle2
                              : a.action === "lancer" ? PlayCircle
                                : a.action === "terminer" ? Archive : Trash2
                            const dangereux = a.action === "annuler"
                            /** Bouton SANS onClick propre quand dangereux : le
                             *  clic n'ouvre QUE l'AlertDialog (jamais de
                             *  transition directe non confirmée). */
                            const bouton = (onClick?: () => void) => (
                              <Button
                                key={a.action}
                                variant={dangereux ? "destructive" : "outline"}
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                disabled={busy !== null}
                                onClick={onClick}
                              >
                                {enCours
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  : <Icone className="h-3.5 w-3.5" aria-hidden />}
                                {a.label}
                              </Button>
                            )
                            return dangereux ? (
                              <AlertDialog key={a.action}>
                                <AlertDialogTrigger asChild>{bouton()}</AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Annuler la campagne « {c.nom} » ?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      La campagne passera au statut « Annulée » (irréversible dans cette version).
                                      Le rapport et le snapshot des supports restent consultables et exportables.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Conserver la campagne</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => void transition(c, "annuler")}>
                                      Oui, annuler la campagne
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : bouton(() => void transition(c, a.action))
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/** Carte KPI compacte. */
function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof Coins; label: string; value: string; tone?: "emerald" | "terra"
}) {
  return (
    <Card className={cn(
      "min-w-0",
      tone === "emerald" && "border-emerald-200 dark:border-emerald-900",
      tone === "terra" && "border-[var(--c-terra)]/60",
    )}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : tone === "terra" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                : "bg-muted text-muted-foreground",
          )} aria-hidden>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1.5 truncate text-[15px] font-bold leading-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

/** T59 — timeline du cycle de vie : Simulée → Validée → En cours → Terminée,
 *  avec dérivation « Annulée » affichée en cas d'annulation (branche
 *  terracotta). Étape courante = point plein + libellé gras ; étapes
 *  franchies = point coché émeraude ; à venir = point discret. */
function TimelineStatut({ statut }: { statut: string }) {
  const ETAPES: { id: string; label: string; icone: typeof CircleDashed }[] = [
    { id: "SIMULEE", label: "Simulée", icone: CircleDashed },
    { id: "VALIDEE", label: "Validée", icone: CheckCircle2 },
    { id: "EN_COURS", label: "En cours", icone: PlayCircle },
    { id: "TERMINEE", label: "Terminée", icone: Archive },
  ]
  if (statut === "ANNULEE") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2 dark:border-orange-800 dark:bg-orange-950/30">
        <XCircle className="h-4 w-4 shrink-0 text-[var(--c-terra)]" aria-hidden />
        <p className="text-[12px] font-semibold text-[var(--c-terra)] dark:text-orange-300">
          Campagne annulée — le rapport d'estimation reste archivé et exportable.
        </p>
      </div>
    )
  }
  const idx = ETAPES.findIndex(e => e.id === statut)
  return (
    <ol className="mt-2 flex items-center gap-1" aria-label="Progression du cycle de vie">
      {ETAPES.map((e, i) => {
        const franchie = i < idx
        const courante = i === idx
        const Ic = e.icone
        return (
          <li key={e.id} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <span
                className={cn("mx-0.5 h-0.5 w-5 shrink-0 rounded-full sm:w-8", franchie || courante ? "bg-emerald-400" : "bg-muted")}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium",
                courante && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                franchie && !courante && "text-emerald-700 dark:text-emerald-400",
                !franchie && !courante && "text-muted-foreground",
              )}
            >
              <Ic
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  franchie && "text-emerald-600 dark:text-emerald-400",
                  courante && "text-emerald-600 dark:text-emerald-400",
                )}
                aria-hidden
              />
              <span className="truncate">{e.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
