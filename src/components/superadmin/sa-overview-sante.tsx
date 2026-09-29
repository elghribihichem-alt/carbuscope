'use client'

// Super Administration — Vue d'ensemble : carte « Santé de la plateforme »
// (T52-R1). Version compacte et vivante de l'ancien module sa-supervision.tsx
// (code mort, miné pour ce composant) : relevé réel au chargement via
// GET /api/super/supervision (réécrite en T52-R1 sur les modèles vivants) —
// base de données (taille, lignes, latence), sonde des routes API, fraîcheur
// des données métier et charge de modération. Les jobs planifiés du module
// d'origine reposaient sur le modèle fantôme « JobPlateforme » (inexistant) :
// aucune donnée réelle n'est disponible — besoin signalé à l'orchestrateur,
// aucune donnée fabriquée ici.
// Identité : emerald = sain, amber = à surveiller, red = dégradé — jamais de bleu.

import { useCallback, useEffect, useState } from "react"
import { Activity, Database, Gauge, HeartPulse, Inbox, RefreshCw, Timer } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo } from "./sa-shared"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

interface SanteResponse {
  releveAt: string
  base: { fichier: string; tailleKo: number; nbTables: number; totalLignes: number; latenceMs: number }
  api: { endpoints: { chemin: string; statut: string; latenceMs: number }[]; ok: number; total: number }
  fraicheur: {
    dernierPrixCarburantAt: string | null
    derniereContributionAt: string | null
    dernierAuditAt: string | null
    derniereConnexionAt: string | null
  }
  charge: { missionsEnCours: number; signalementsEnAttente: number; alertesCritiques: number }
}

// ---------------------------------------------------------------- helpers

const fmtInt = (n: number): string => new Intl.NumberFormat("fr-FR").format(n)

/** Ko → « 6 108 Ko » / « 10,2 Mo ». */
function fmtTaille(ko: number): string {
  if (ko >= 1024) return `${(ko / 1024).toFixed(1).replace(".", ",")} Mo`
  return `${fmtInt(ko)} Ko`
}

/** ms → « 18 ms » / « 1,6 s ». */
function fmtDuree(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`
}

/** Jours écoulés depuis un ISO (null → null). */
function joursDepuis(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

type Etat = "ok" | "watch" | "ko"

const PASTILLE: Record<Etat, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  watch: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ko: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
}

/** Point de couleur inline (état d'une métrique). */
function Point({ etat }: { etat: Etat }) {
  const bg = etat === "ok" ? "bg-emerald-500" : etat === "watch" ? "bg-amber-500" : "bg-red-500"
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", bg)} aria-hidden />
}

/** Ligne clé/valeur avec point d'état. */
function Ligne({ label, valeur, etat, title }: { label: string; valeur: string; etat: Etat; title?: string }) {
  return (
    <li className="flex items-center gap-2 text-xs" title={title}>
      <Point etat={etat} />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{valeur}</span>
    </li>
  )
}

// ---------------------------------------------------------------- composant

export function SaOverviewSante() {
  const [data, setData] = useState<SanteResponse | null>(null)
  const [echec, setEchec] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [enCours, setEnCours] = useState(true)
  const recharger = useCallback(() => {
    setEnCours(true)
    setReloadKey(k => k + 1)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void fetch("/api/super/supervision", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: SanteResponse) => {
        setData(d)
        setEchec(false)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setEchec(true)
      })
      .finally(() => setEnCours(false))
    return () => ac.abort()
  }, [reloadKey])

  if (echec) {
    // Carte de supervision = complément d'information : jamais une erreur rouge.
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartPulse className="h-4 w-4 text-muted-foreground" aria-hidden /> Santé de la plateforme
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Relevé indisponible pour le moment.</p>
          <Button variant="outline" size="sm" className="h-8" onClick={recharger}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card aria-busy="true" aria-label="Chargement de la santé de la plateforme">
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-full max-w-72" />)}
        </CardContent>
      </Card>
    )
  }

  const { base, api, fraicheur, charge } = data

  // ---- états dérivés (mêmes seuils pédagogiques que l'ancien module ④)
  const latenceEtat: Etat = base.latenceMs < 100 ? "ok" : base.latenceMs < 400 ? "watch" : "ko"
  const apiEtat: Etat = api.ok === api.total ? "ok" : api.ok > 0 ? "watch" : "ko"
  const pireLatence = Math.max(...api.endpoints.map(e => e.latenceMs), 0)
  const joursPrix = joursDepuis(fraicheur.dernierPrixCarburantAt)
  const prixEtat: Etat = joursPrix === null ? "ko" : joursPrix <= 100 ? "ok" : joursPrix <= 190 ? "watch" : "ko"
  const joursContrib = joursDepuis(fraicheur.derniereContributionAt)
  const contribEtat: Etat = joursContrib === null ? "watch" : joursContrib <= 7 ? "ok" : joursContrib <= 30 ? "watch" : "ko"
  const joursAudit = joursDepuis(fraicheur.dernierAuditAt)
  const auditEtat: Etat = joursAudit === null ? "watch" : joursAudit <= 7 ? "ok" : joursAudit <= 30 ? "watch" : "ko"
  const modEtat: Etat = charge.signalementsEnAttente === 0 ? "ok" : charge.signalementsEnAttente < 10 ? "watch" : "ko"
  const alertesEtat: Etat = charge.alertesCritiques === 0 ? "ok" : charge.alertesCritiques < 6 ? "watch" : "ko"

  const global: Etat = [latenceEtat, apiEtat, prixEtat, contribEtat, auditEtat, modEtat, alertesEtat].includes("ko")
    ? "ko"
    : [latenceEtat, apiEtat, prixEtat, contribEtat, auditEtat, modEtat, alertesEtat].includes("watch")
      ? "watch"
      : "ok"

  const statutGlobal = global === "ok"
    ? { label: "Saine", className: PASTILLE.ok }
    : global === "watch"
      ? { label: "À surveiller", className: PASTILLE.watch }
      : { label: "Dégradée", className: PASTILLE.ko }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <HeartPulse
              className={cn(
                "h-4 w-4",
                global === "ok" ? "text-emerald-600 dark:text-emerald-400" : global === "watch" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400",
              )}
              aria-hidden
            />
            Santé de la plateforme
          </span>
          <span className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]", statutGlobal.className)}>
              {statutGlobal.label}
            </Badge>
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1 px-2 text-xs text-teal-700 hover:text-teal-800 dark:text-teal-400"
              onClick={recharger}
              disabled={enCours}
              aria-label="Actualiser le relevé de santé"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", enCours && "animate-spin")} aria-hidden /> Actualiser
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <section aria-label="Santé de la base de données" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Database className="h-3.5 w-3.5" aria-hidden /> Base de données
          </p>
          <ul className="space-y-1.5">
            <Ligne label="Volumétrie" valeur={`${fmtTaille(base.tailleKo)} · ${fmtInt(base.totalLignes)} lignes`} etat="ok" />
            <Ligne label="Latence de relevé" valeur={fmtDuree(base.latenceMs)} etat={latenceEtat} title="Cumul des comptages table par table" />
            <Ligne label="Tables suivies" valeur={fmtInt(base.nbTables)} etat="ok" />
          </ul>
        </section>
        <section aria-label="Santé des API" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden /> Endpoints API
          </p>
          <ul className="space-y-1.5">
            <Ligne label="Sonde au chargement" valeur={`${api.ok}/${api.total} en bonne santé`} etat={apiEtat} />
            <Ligne label="Latence la plus haute" valeur={fmtDuree(pireLatence)} etat={pireLatence <= 400 ? "ok" : pireLatence <= 1000 ? "watch" : "ko"} />
          </ul>
        </section>
        <section aria-label="Fraîcheur des données" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Timer className="h-3.5 w-3.5" aria-hidden /> Fraîcheur des données
          </p>
          <ul className="space-y-1.5">
            <Ligne
              label="Dernier prix carburant"
              valeur={fraicheur.dernierPrixCarburantAt ? timeAgo(fraicheur.dernierPrixCarburantAt) : "—"}
              etat={prixEtat}
              title="Date d'application du dernier décret"
            />
            <Ligne
              label="Dernière contribution"
              valeur={fraicheur.derniereContributionAt ? timeAgo(fraicheur.derniereContributionAt) : "—"}
              etat={contribEtat}
            />
            <Ligne
              label="Dernière écriture d'audit"
              valeur={fraicheur.dernierAuditAt ? timeAgo(fraicheur.dernierAuditAt) : "—"}
              etat={auditEtat}
            />
          </ul>
        </section>
        <section aria-label="Charge de modération" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" aria-hidden /> Charge & modération
          </p>
          <ul className="space-y-1.5">
            <Ligne label="Missions terrain en cours" valeur={fmtInt(charge.missionsEnCours)} etat="ok" title="Activité normale du dispositif terrain" />
            <Ligne
              label="Signalements à modérer"
              valeur={fmtInt(charge.signalementsEnAttente)}
              etat={modEtat}
              title="Contributions communautaires en attente de validation"
            />
            <Ligne
              label="Alertes critiques non lues"
              valeur={fmtInt(charge.alertesCritiques)}
              etat={alertesEtat}
              title="Alertes veille concurrentielle de sévérité critique"
            />
          </ul>
        </section>
        <p className="col-span-full flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground sm:col-span-2">
          <Inbox className="h-3 w-3 shrink-0" aria-hidden />
          Relevé en direct à chaque consultation — {fmtInt(base.totalLignes)} lignes mesurées sur {fmtInt(base.nbTables)} tables vivantes.
        </p>
      </CardContent>
    </Card>
  )
}
