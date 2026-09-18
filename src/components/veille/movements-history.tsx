'use client'

// CarbuScope — Historique des mouvements détectés (module A.7.3)
// Table filtrable (type + recherche), 50 derniers mouvements, export CSV.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ImpactBadge } from "@/components/shell/badges"
import { MOVEMENT_TYPE_LABELS, type MovementDTO } from "@/lib/types"
import { Search, Download } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { dateFr, MOVEMENT_BADGE_CLS, NEUTRAL_DOT, exportMovementsCsv } from "./veille-utils"

const MOVEMENT_TYPES = ["OPENING", "RENOVATION", "CLOSURE", "REBRAND"] as const

export function MovementsHistory({
  movements, brandColors,
}: { movements: MovementDTO[]; brandColors: Record<string, string> }) {
  const [type, setType] = useState("all")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements.filter(m =>
      (type === "all" || m.type === type) &&
      (!q || `${m.brand} ${m.station} ${m.gouvernorat}`.toLowerCase().includes(q))
    )
  }, [movements, type, search])

  const rows = filtered.slice(0, 50)

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("Aucun mouvement à exporter", { description: "Ajustez les filtres avant d'exporter." })
      return
    }
    exportMovementsCsv(filtered)
    toast.success("Export CSV téléchargé", {
      description: `${filtered.length} mouvement${filtered.length > 1 ? "s" : ""} exporté${filtered.length > 1 ? "s" : ""}.`,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Historique des mouvements détectés</CardTitle>
            <CardDescription>
              {filtered.length} mouvement{filtered.length > 1 ? "s" : ""} — 50 derniers affichés
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Exporter en CSV
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Filtrer par type de mouvement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {MOVEMENT_TYPES.map(t => (
                <SelectItem key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (enseigne, station, lieu)…"
              className="h-8 pl-8 text-xs"
              aria-label="Rechercher dans les mouvements"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-80 pr-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[130px]">Type</TableHead>
                <TableHead className="w-[140px]">Enseigne</TableHead>
                <TableHead>Station</TableHead>
                <TableHead className="w-[120px]">Gouvernorat</TableHead>
                <TableHead className="w-[110px] text-right">Impact estimé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Aucun mouvement détecté pour ces filtres.
                  </TableCell>
                </TableRow>
              )}
              {rows.map(m => (
                <TableRow key={m.id} className="hover:bg-muted/40">
                  <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {dateFr(m.date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[11px]", MOVEMENT_BADGE_CLS[m.type] ?? "")}>
                      {MOVEMENT_TYPE_LABELS[m.type] ?? String(m.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: brandColors[m.brand] ?? NEUTRAL_DOT }}
                        aria-hidden
                      />
                      <span className="truncate">{m.brand}</span>
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs" title={m.station}>
                    {m.station}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.gouvernorat}</TableCell>
                  <TableCell className="text-right">
                    <ImpactBadge impact={m.impact} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        {filtered.length > 50 && (
          <p className="mt-2 text-xs text-muted-foreground">
            50 derniers affichés sur {filtered.length} — affinez les filtres ou exportez le CSV complet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
