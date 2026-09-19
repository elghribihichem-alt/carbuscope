'use client'

// A.9 — Paramètres : API (clé, quotas, documentation, usage 7 jours)
// T27 : quotas en DataViews — 2 lignes statiques sans statut : regroupement
// artificiel écarté → 2 modes (Tableau / Cartes).

import { useState } from "react"
import { toast } from "sonner"
import {
  KeyRound, Copy, RefreshCcw, BookOpen, PlugZap, Activity,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import { copyText, generateKeySuffix, maskedApiKey } from "@/components/settings/settings-shared"

type QuotaRow = { quota: string; limite: string }

const QUOTA_COLUMNS: DataViewColumn<QuotaRow>[] = [
  {
    key: "quota", header: "Quota",
    sortValue: (q) => q.quota,
    render: (q) => <span className="text-sm">{q.quota}</span>,
  },
  {
    key: "limite", header: "Limite", align: "right",
    sortValue: (q) => q.limite,
    render: (q) => <span className="text-sm font-medium tabular-nums">{q.limite}</span>,
  },
]

const API_QUOTAS: QuotaRow[] = [
  { quota: "Requêtes mensuelles", limite: "10 000 / mois" },
  { quota: "Rafale (burst)", limite: "60 / min" },
]

// Usage mock sur 7 jours (requêtes/jour, quota 10 000/mois)
const USAGE_7J = [
  { jour: "Lun", req: 214 },
  { jour: "Mar", req: 187 },
  { jour: "Mer", req: 342 },
  { jour: "Jeu", req: 265 },
  { jour: "Ven", req: 389 },
  { jour: "Sam", req: 158 },
  { jour: "Dim", req: 96 },
]

export function SettingsApiCard() {
  const [keySuffix, setKeySuffix] = useState("3f8a")
  const [apiActive, setApiActive] = useState(true)
  const fullKey = `csk_live_9d4c2e61b8${keySuffix}`

  const copyKey = () => {
    void copyText(fullKey).then(ok => {
      if (ok) toast.success("Clé API copiée dans le presse-papiers", { description: "En-tête : Authorization: Bearer …" })
      else toast.error("Copie impossible dans ce navigateur.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlugZap className="h-4 w-4 text-orange-600" aria-hidden /> API
            </CardTitle>
            <CardDescription>
              Clé d&apos;accès, quotas mensuels et documentation technique de l&apos;API CarbuScope.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="api-active" className="text-sm">Accès API activé</Label>
            <Switch
              id="api-active"
              checked={apiActive}
              onCheckedChange={v => {
                setApiActive(v)
                toast[v ? "success" : "warning"](v ? "Accès API activé" : "Accès API désactivé", {
                  description: v
                    ? "La clé redevient opérationnelle immédiatement."
                    : "Tous les appels seront rejetés (HTTP 403) jusqu'à réactivation.",
                })
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Clé masquée */}
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" aria-hidden /> Clé API
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className={`rounded bg-muted px-2.5 py-1.5 font-mono text-xs select-all ${apiActive ? "" : "opacity-50 line-through"}`}>
              {maskedApiKey(keySuffix)}
            </code>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyKey}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copier
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setKeySuffix(generateKeySuffix())
                toast.warning("Nouvelle clé API générée", {
                  description: "L'ancienne clé est révoquée sous 24 h — mettez à jour vos intégrations.",
                })
              }}
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Régénérer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => toast.info("Documentation API", {
                description: "https://api.carbuscope.tn/docs — schémas, codes d'erreur, pagination et webhooks.",
              })}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> Documentation
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Quotas */}
          <div>
            <DataViews
              viewKey="settings-api-quotas"
              columns={QUOTA_COLUMNS}
              rows={API_QUOTAS}
              rowKey={(q) => q.quota}
              emptyMessage="Aucun quota configuré."
            />
          </div>

          {/* Usage 7 jours (mock) */}
          <div className="rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5" aria-hidden /> Usage — 7 derniers jours (requêtes/jour)
            </p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={USAGE_7J} margin={{ top: 4, right: 4, bottom: 0, left: -26 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="jour" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} />
                  <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} width={40} />
                  <Tooltip contentStyle={tooltipStyle()} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                  <Bar dataKey="req" name="Requêtes" fill="#d9a514" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
