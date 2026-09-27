'use client'

// Shadow Market (T44-e) — onglet « 📤 Export / Partage ».
// Exports de données (CSV points, Excel .xls, JSON vue d'ensemble, GeoJSON des
// points) + partage email simulé vers un décideur + journal des exports
// (historique serveur + entrées générées pendant la session).

import * as React from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  FileCode2, FileDown, FileSpreadsheet, FileText, Loader2, Mail, MapPin, Send, Table2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ShadowOverviewResponse, ShadowPointDTO } from "@/lib/types"
import { formatTnd } from "../shadow-shared"
import type { ShadowReportsCtx } from "./shadow-reports"
import { downloadOverviewJson, downloadPointsCsv, downloadPointsExcel, downloadPointsGeoJson } from "./report-utils"
import { downloadShadowSummaryPdf } from "./shadow-pdf"

type SessionExport = { id: string; name: string; format: string; sizeKb: number; createdAt: string; scope: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/


export function ExportShareTab({ ctx }: { ctx: ShadowReportsCtx }) {
  const { reports, scopeLabel, reload } = ctx
  const [sessionExports, setSessionExports] = useState<SessionExport[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // Partage email
  const [dest, setDest] = useState("")
  const [level, setLevel] = useState("synthèse")
  const [message, setMessage] = useState("")
  const [messageDirty, setMessageDirty] = useState(false)
  const [sending, setSending] = useState(false)

  const autoMessage = useMemo(() => {
    const s = reports.summary
    const base =
      `Shadow Market — synthèse ${reports.monthLabel} (${scopeLabel}) :\n` +
      `• ${s.activePoints.toLocaleString("fr-FR")} points de vente informels actifs\n` +
      `• ${formatTnd(s.estLossTnd)} de perte mensuelle estimée pour le réseau formel\n` +
      `• ${s.stationsThreatened} stations menacées — gouvernorat le plus touché : ${s.topGouvernorat}\n`
    if (level === "complet") {
      return (
        base +
        `• ${s.newPoints} nouveaux points / ${s.neutralized} neutralisés ce mois\n` +
        `• ${s.pendingValidation} signalements en attente de validation\n\n` +
        `Le rapport complet (top 10 menaces, pertes par gouvernorat, typologies, recommandations) est joint en PDF.\n` +
        `Document « Diffusion restreinte » — généré par CarbuScope, module Shadow Market.`
      )
    }
    return `${base}\nRapport détaillé disponible sur demande — CarbuScope, module Shadow Market.`
  }, [reports, scopeLabel, level])

  // Pré-remplissage / mise à jour du message tant que l'utilisateur n'a pas édité.
  React.useEffect(() => {
    if (messageDirty) return
    const id = requestAnimationFrame(() => setMessage(autoMessage))
    return () => cancelAnimationFrame(id)
  }, [autoMessage, messageDirty])

  const addSessionExport = (e: SessionExport) => setSessionExports(prev => [e, ...prev])

  // ------------------------------------------------------------------
  // Exports de données
  // ------------------------------------------------------------------

  const fetchPoints = async (): Promise<ShadowPointDTO[] | null> => {
    const r = await fetch("/api/shadow/points?limit=1000")
    if (!r.ok) return null
    const j = (await r.json()) as { points: ShadowPointDTO[] }
    return j.points
  }

  const runExport = async (kind: "csv" | "excel" | "json" | "geojson" | "pdf") => {
    setBusy(kind)
    try {
      if (kind === "pdf") {
        // PDF réel (jsPDF) — synthèse mensuelle (blocs synthèse, KPIs,
        // recommandations) + note méthodologique. La taille consignée dans le
        // journal est la taille RÉELLE du blob généré.
        const res = downloadShadowSummaryPdf(reports, scopeLabel)
        addSessionExport({
          id: `pdf-${Date.now()}`,
          name: `Synthèse mensuelle — PDF (${reports.monthLabel})`,
          format: "PDF",
          sizeKb: res.sizeKb,
          createdAt: new Date().toISOString(),
          scope: scopeLabel,
        })
        toast.success("Export PDF téléchargé", {
          description: `${res.filename} — ${res.sizeKb.toLocaleString("fr-FR")} Ko (taille réelle) : synthèse, KPIs et recommandations du mois ${reports.monthLabel}.`,
        })
        return
      }
      if (kind === "json") {
        const r = await fetch("/api/shadow/overview")
        if (!r.ok) throw new Error("overview")
        const ov = (await r.json()) as ShadowOverviewResponse
        downloadOverviewJson(ov)
        addSessionExport({
          id: `json-${Date.now()}`,
          name: "Vue d'ensemble — photographie JSON",
          format: "JSON",
          sizeKb: Math.max(1, Math.round(JSON.stringify(ov).length / 1024)),
          createdAt: new Date().toISOString(),
          scope: scopeLabel,
        })
        toast.success("Export JSON téléchargé", {
          description: `shadow-overview.json — KPIs, alertes, gouvernorats, typologies, série 12 mois (${scopeLabel}).`,
        })
        return
      }
      const points = await fetchPoints()
      if (!points) throw new Error("points")
      const stamp = new Date().toISOString().slice(0, 10)
      if (kind === "csv") {
        downloadPointsCsv(points)
        addSessionExport({
          id: `csv-${Date.now()}`,
          name: `Points informels — CSV (${points.length})`,
          format: "CSV",
          sizeKb: Math.max(1, Math.round(points.length * 0.42)),
          createdAt: new Date().toISOString(),
          scope: "Points",
        })
        toast.success("Export CSV téléchargé", {
          description: `shadow-points-${stamp}.csv — ${points.length} points (BOM UTF-8, séparateur « ; », compatible Excel).`,
        })
      } else if (kind === "excel") {
        downloadPointsExcel(points)
        addSessionExport({
          id: `xls-${Date.now()}`,
          name: `Points informels — Excel (${points.length})`,
          format: "Excel",
          sizeKb: Math.max(1, Math.round(points.length * 0.58)),
          createdAt: new Date().toISOString(),
          scope: "Points",
        })
        toast.success("Export Excel téléchargé", {
          description: `shadow-points-${stamp}.xls — ${points.length} points, colonnes typologie / perte / station proche.`,
        })
      } else {
        downloadPointsGeoJson(points)
        addSessionExport({
          id: `geo-${Date.now()}`,
          name: `Points informels — GeoJSON (${points.length})`,
          format: "GeoJSON",
          sizeKb: Math.max(1, Math.round(points.length * 0.72)),
          createdAt: new Date().toISOString(),
          scope: "Points",
        })
        toast.success("Export GeoJSON téléchargé", {
          description: `shadow-points-${stamp}.geojson — FeatureCollection prête pour SIG / QGIS (code, typologie, volume, perte).`,
        })
      }
    } catch {
      toast.error("Export impossible", { description: "Les données n'ont pas pu être récupérées. Réessayez." })
    } finally {
      setBusy(null)
    }
  }

  // ------------------------------------------------------------------
  // Partage email (simulé) + trace dans les exports
  // ------------------------------------------------------------------

  const sendEmail = () => {
    if (!EMAIL_RE.test(dest.trim())) {
      toast.error("Destinataire invalide", { description: "Saisissez une adresse email valide (ex. dg@agil.tn)." })
      return
    }
    setSending(true)
    fetch("/api/shadow/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => {
        if (!r.ok) throw new Error("trace")
        return r.json()
      })
      .then(() => {
        const sizeKb = level === "complet" ? 480 : 14
        addSessionExport({
          id: `email-${Date.now()}`,
          name: `Partage email — ${dest.trim()}`,
          format: "EMAIL",
          sizeKb,
          createdAt: new Date().toISOString(),
          scope: level === "complet" ? "EMAIL · complet" : "EMAIL · synthèse",
        })
        reload()
        toast.success(`Email simulé envoyé à ${dest.trim()}`, {
          description:
            `Niveau ${level} (~${sizeKb} Ko) — démonstration : aucun serveur SMTP n'est contacté. ` +
            "Le partage est tracé dans le journal des exports et archivé en base (type SHADOW).",
        })
      })
      .catch(() => {
        toast.error("Envoi impossible", { description: "Le partage n'a pas pu être tracé. Réessayez." })
      })
      .finally(() => setSending(false))
  }

  const journal = [...sessionExports, ...reports.exports]
  const FORMAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    PDF: FileText,
    Excel: FileSpreadsheet,
    CSV: FileDown,
    JSON: FileCode2,
    GeoJSON: MapPin,
    EMAIL: Mail,
  }

  const EXPORT_CARDS = [
    { kind: "pdf" as const, icon: FileText, label: "PDF — synthèse mensuelle", desc: "rapport PDF réel : synthèse, KPIs, recommandations" },
    { kind: "csv" as const, icon: Table2, label: "CSV — points", desc: "1000 derniers points, « ; » + BOM (Excel-ready)" },
    { kind: "excel" as const, icon: FileSpreadsheet, label: "Excel — points", desc: ".xls (table HTML), colonnes de perte & proximité" },
    { kind: "json" as const, icon: FileCode2, label: "JSON — vue d'ensemble", desc: "photographie complète : KPIs, alertes, séries" },
    { kind: "geojson" as const, icon: MapPin, label: "GeoJSON — points", desc: "FeatureCollection SIG (code, typologie, volume, perte)" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Carte Exports */}
        <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-3 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <span aria-hidden>📦</span> Exports de données
            </h3>
            <p className="text-xs text-muted-foreground">
              Cinq formats datés du jour (ex. <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">shadow-points-2026-09-26.csv</code>,
              <code className="ml-1 rounded bg-stone-100 px-1 dark:bg-stone-800">shadow-synthese-2026-09-26.pdf</code>) —
              chaque export est tracé dans le journal ci-dessous (taille réelle des fichiers).
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPORT_CARDS.map(x => {
                const Icon = x.icon
                const isBusy = busy === x.kind
                return (
                  <button
                    key={x.kind}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void runExport(x.kind)}
                    className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-white p-3 text-start transition-all hover:border-[#E53935]/50 hover:shadow-sm disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/10 text-[#E53935]">
                      {isBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden /> : <Icon className="h-4.5 w-4.5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-stone-800 dark:text-stone-100">{x.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{x.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Carte Partage email */}
        <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-3 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <span aria-hidden>✉️</span> Partage email au décideur
            </h3>
            <p className="text-xs text-muted-foreground">
              Envoi direct du résumé au DG / directeur régional — démonstration simulée, tracée dans le journal.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium" htmlFor="shadow-email-dest">Destinataire</Label>
              <Input
                id="shadow-email-dest"
                type="email"
                value={dest}
                onChange={e => setDest(e.target.value)}
                placeholder="dg@agil.tn"
                className="max-w-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Niveau de détail</Label>
              <Select
                value={level}
                onValueChange={v => {
                  setLevel(v)
                  setMessageDirty(false)
                }}
              >
                <SelectTrigger className="w-[220px]" aria-label="Niveau de détail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="synthèse">Synthèse (~14 Ko)</SelectItem>
                  <SelectItem value="complet">Complet + pièce jointe (~480 Ko)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium" htmlFor="shadow-email-msg">Message (pré-rempli auto)</Label>
              <Textarea
                id="shadow-email-msg"
                value={message}
                onChange={e => {
                  setMessage(e.target.value)
                  setMessageDirty(true)
                }}
                rows={7}
                className="text-[11.5px] leading-relaxed"
              />
              {messageDirty && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-[#2196F3] underline-offset-2 hover:underline"
                  onClick={() => setMessageDirty(false)}
                >
                  Restaurer le message auto
                </button>
              )}
            </div>
            <Button onClick={sendEmail} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Envoyer à {dest.trim() || "…"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Journal des exports */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <span aria-hidden>🧾</span> Journal des exports récents
            <Badge variant="outline" className="text-[10px]">{journal.length}</Badge>
            {sessionExports.length > 0 && (
              <Badge variant="outline" className="border-[#4CAF50]/40 bg-[#4CAF50]/10 text-[10px] text-[#2E7D32] dark:text-[#81C784]">
                {sessionExports.length} cette session
              </Badge>
            )}
          </h3>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 [scrollbar-width:thin]">
            <Table>
              <TableHeader className="sticky top-0 bg-stone-50 dark:bg-stone-900">
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Taille</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Périmètre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journal.map(e => {
                  const Icon = FORMAT_ICONS[e.format] ?? FileText
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[300px] truncate text-xs font-medium" title={e.name}>{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <Icon className="h-3 w-3" aria-hidden />
                          {e.format}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{e.sizeKb.toLocaleString("fr-FR")} Ko</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.scope}</TableCell>
                    </TableRow>
                  )
                })}
                {journal.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                      Aucun export — lancez un export de données ou un partage email.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
