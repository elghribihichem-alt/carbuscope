'use client'

// C.2.4 — API de synchronisation : endpoint REST, clé API, quotas, exemples

import { useState } from "react"
import { toast } from "sonner"
import { KeyRound, Copy, RefreshCcw, Terminal, Braces, PlugZap, BookOpen } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copyText, generateKeySuffix, maskedApiKey } from "@/components/settings/settings-shared"

const ENDPOINT = "https://api.carbuscope.tn/v1/stations/sync"

const CURL_SAMPLE = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer $CARBUSCOPE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "stations": [
      {
        "code": "TN-0295",
        "name": "Agil Soukra",
        "services": ["cafe", "lavage", "recharge"],
        "open24": true,
        "open7j": true
      }
    ]
  }'`

const RESPONSE_SAMPLE = `{
  "synced": 228,
  "created": 1,
  "updated": 12,
  "pending": 2,
  "workflow": "verification_coherence",
  "syncedAt": "2026-09-18T10:32:00Z"
}`

function CodeBlock({ title, code, icon: Icon }: { title: string; code: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => {
            void copyText(code).then(ok => {
              if (ok) toast.success("Copié dans le presse-papiers", { description: title })
              else toast.error("Copie impossible dans ce navigateur.")
            })
          }}
        >
          <Copy className="h-3 w-3" aria-hidden /> Copier
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function PortalApi({ brandName }: { brandName: string }) {
  const [keySuffix, setKeySuffix] = useState("3f8a")
  const fullKey = `csk_live_4b21e9d7c5${keySuffix}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZap className="h-4 w-4 text-purple-600" aria-hidden /> API de synchronisation
        </CardTitle>
        <CardDescription>
          Endpoint REST pour synchroniser automatiquement les données de votre réseau {brandName} — les mises à jour
          suivent le même workflow de validation avant publication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Endpoint + clé + quotas */}
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Endpoint de synchronisation</p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                <Badge className="bg-emerald-600 text-white" aria-label="Méthode POST">POST</Badge>
                <code className="min-w-0 flex-1 truncate font-mono text-xs" title={ENDPOINT}>{ENDPOINT}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0"
                  aria-label="Copier l'endpoint"
                  onClick={() => {
                    void copyText(ENDPOINT).then(ok => {
                      if (ok) toast.success("Endpoint copié dans le presse-papiers")
                      else toast.error("Copie impossible dans ce navigateur.")
                    })
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> Clé API (authentification Bearer)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2.5 py-1.5 font-mono text-xs select-all">{maskedApiKey(keySuffix)}</code>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void copyText(fullKey).then(ok => {
                      if (ok) toast.success("Clé API copiée dans le presse-papiers", {
                        description: "Utilisez-la dans l'en-tête Authorization: Bearer …",
                      })
                      else toast.error("Copie impossible dans ce navigateur.")
                    })
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setKeySuffix(generateKeySuffix())
                    toast.warning("Nouvelle clé générée", {
                      description: "L'ancienne clé sera révoquée sous 24 h — mettez à jour vos intégrations.",
                    })
                  }}
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Régénérer la clé
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ne partagez jamais votre clé : chaque appel est signé, journalisé et soumis aux quotas.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quota</TableHead>
                    <TableHead className="text-right">Limite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Requêtes mensuelles</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">10 000 / mois</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Limite de débit (rafale)</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">60 req/min</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Format des échanges</TableCell>
                    <TableCell className="text-right font-medium">JSON (UTF-8)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Exemples */}
          <div className="space-y-3">
            <CodeBlock title="Exemple de requête (curl)" code={CURL_SAMPLE} icon={Terminal} />
            <CodeBlock title="Exemple de réponse (JSON)" code={RESPONSE_SAMPLE} icon={Braces} />
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Référez-vous à la documentation complète (schémas, codes d&apos;erreur, pagination) avant votre
                première synchronisation. Les mots-clés <code className="font-mono">created</code> /{" "}
                <code className="font-mono">updated</code> renvoient aux seules fiches modifiées.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
