'use client'

// CarbuScope — T60-e — panneau de FILTRES de l'explorateur de faces.
// Tous les filtres cumulables du contrat GET /api/media/faces : 6 Selects
// (gouvernorat / délégation / format / technologie / statut / support — options
// déduites des données chargées), 6 Inputs numériques (prix min/max, TMJA min,
// audience min, SOV max, distance station), 2 Switch tri-états (concurrence /
// alcool : off = indifférent, on = choix Oui/Non) + Réinitialiser + filtres
// sauvegardés (enregistrer / appliquer / supprimer — POST-GET-DELETE
// /api/media/filters). Utilisé en sidebar desktop (w-64) ET en Sheet mobile.

import { useState } from "react"
import { BookmarkPlus, ListFilter, Loader2, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { apiJson, useLocalT } from "@/components/media/media-shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { SavedFilterDTO } from "@/lib/media/shared"
import {
  EMPTY_FILTERS, X_DICT, filtersActiveCount, filtersToRecord, recordToFilters,
  type ExplorerFilterState,
} from "./explorer-shared"

export interface ExplorerFilterOptions {
  gouvernorats: string[]
  delegations: string[]
  formats: string[]
  technologies: string[]
  statuts: string[]
  supports: string[]
}

export interface ExplorerFiltersProps {
  filters: ExplorerFilterState
  onFiltersChange: (f: ExplorerFilterState) => void
  options: ExplorerFilterOptions
  /** Filtres sauvegardés du membre (chargés par le conteneur). */
  saved: SavedFilterDTO[]
  onSavedChange: (list: SavedFilterDTO[]) => void
}

const ALL = "__all__"

export function ExplorerFilters({ filters, onFiltersChange, options, saved, onSavedChange }: ExplorerFiltersProps) {
  const { t } = useLocalT(X_DICT)

  const set = <K extends keyof ExplorerFilterState>(key: K, value: ExplorerFilterState[K]) =>
    onFiltersChange({ ...filters, [key]: value })

  const select = (key: keyof ExplorerFilterState, label: string, values: string[], allLabel: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${key}`} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={filters[key] === "" ? ALL : filters[key]} onValueChange={v => set(key, v === ALL ? "" : v)}>
        <SelectTrigger id={`f-${key}`} className="h-11 w-full text-sm" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {values.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )

  const numInput = (key: keyof ExplorerFilterState, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${key}`} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        id={`f-${key}`}
        type="number"
        inputMode="decimal"
        min={0}
        className="h-11 text-sm tabular-nums"
        placeholder={placeholder}
        value={filters[key] as string}
        onChange={e => set(key, e.target.value)}
        aria-label={label}
      />
    </div>
  )

  /** Switch tri-état : off = indifférent (param absent de la requête),
   *  on = Oui/Non via le mini-Select qui apparaît. */
  const triSwitch = (key: "concurrence" | "alcool", label: string, oui: string, non: string) => {
    const val = filters[key]
    return (
      <div className="space-y-1.5 rounded-lg border p-2.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`sw-${key}`} className="text-xs font-medium leading-snug">{label}</Label>
          <Switch
            id={`sw-${key}`}
            checked={val !== ""}
            onCheckedChange={on => set(key, on ? "true" : "")}
            aria-label={label}
          />
        </div>
        {val !== "" && (
          <Select value={val} onValueChange={v => set(key, v)}>
            <SelectTrigger className="h-9 w-full text-xs" aria-label={`${label} — ${t("x.filters.oui")}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{oui}</SelectItem>
              <SelectItem value="false">{non}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  const active = filtersActiveCount(filters)

  return (
    <div className="space-y-4">
      {/* — Titre + badge filtres actifs + réinitialiser — */}
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListFilter className="h-3.5 w-3.5" aria-hidden /> {t("x.filters.title")}
        </p>
        {active > 0 && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {active} {active > 1 ? t("x.filters.active.pl") : t("x.filters.active")}
          </Badge>
        )}
      </div>
      <Button
        variant="outline"
        className="h-11 w-full gap-2 text-sm"
        onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}
        disabled={active === 0}
        aria-label={t("x.filters.reset")}
      >
        <RotateCcw className="h-4 w-4" aria-hidden /> {t("x.filters.reset")}
      </Button>

      <Separator />

      {/* — Localisation — */}
      <div className="space-y-3">
        {select("gouvernorat", t("x.filters.gouvernorat"), options.gouvernorats, t("x.filters.allF"))}
        {select("delegation", t("x.filters.delegation"), options.delegations, t("x.filters.allF"))}
      </div>

      <Separator />

      {/* — Support — */}
      <div className="space-y-3">
        {select("format", t("x.filters.format"), options.formats, t("x.filters.all"))}
        {select("technologie", t("x.filters.technologie"), options.technologies, t("x.filters.allF"))}
        {select("support", t("x.filters.support"), options.supports, t("x.filters.all"))}
        {select("statut", t("x.filters.statut"), options.statuts, t("x.filters.all"))}
      </div>

      <Separator />

      {/* — Seuils numériques — */}
      <div className="space-y-3">
        {numInput("prixMin", t("x.filters.prixMin"), "0")}
        {numInput("prixMax", t("x.filters.prixMax"), "∞")}
        {numInput("tmjaMin", t("x.filters.tmjaMin"), "0")}
        {numInput("audienceMin", t("x.filters.audienceMin"), "0")}
        {numInput("sovMax", t("x.filters.sovMax"), "100")}
        {numInput("distanceStationKm", t("x.filters.distanceStationKm"), "0")}
      </div>

      <Separator />

      {/* — Contexte concurrentiel / réglementaire — */}
      <div className="space-y-3">
        {triSwitch("concurrence", t("x.filters.concurrence"), t("x.filters.concurrence.oui"), t("x.filters.concurrence.non"))}
        {triSwitch("alcool", t("x.filters.alcool"), t("x.filters.alcool.oui"), t("x.filters.alcool.non"))}
      </div>

      <Separator />

      <SavedFiltersBlock filters={filters} saved={saved} onSavedChange={onSavedChange} onApply={onFiltersChange} />
    </div>
  )
}

// ─────────────────── Filtres sauvegardés ───────────────────

function SavedFiltersBlock({ filters, saved, onSavedChange, onApply }: {
  filters: ExplorerFilterState
  saved: SavedFilterDTO[]
  onSavedChange: (list: SavedFilterDTO[]) => void
  onApply: (f: ExplorerFilterState) => void
}) {
  const { t } = useLocalT(X_DICT)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const r = await apiJson<{ filter: SavedFilterDTO }>("/api/media/filters", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, filters: filtersToRecord(filters) }),
      })
      onSavedChange([r.filter, ...saved])
      toast.success(t("x.sf.saved"))
      setSaveOpen(false)
      setName("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("x.sf.loadErr"))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await apiJson(`/api/media/filters/${id}`, { method: "DELETE" })
      onSavedChange(saved.filter(f => f.id !== id))
      toast.success(t("x.sf.deleted"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("x.sf.loadErr"))
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("x.sf.title")}</p>
      <Button
        variant="outline"
        className="h-11 w-full gap-2 text-sm"
        onClick={() => setSaveOpen(true)}
        disabled={filtersActiveCount(filters) === 0}
        aria-label={t("x.sf.save")}
      >
        <BookmarkPlus className="h-4 w-4" aria-hidden /> {t("x.sf.save")}
      </Button>

      {saved.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t("x.sf.empty")}</p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label={t("x.sf.title")}>
          {saved.map(f => (
            <li key={f.id} className="flex items-center gap-1.5 rounded-lg border p-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-medium hover:bg-accent"
                onClick={() => onApply(recordToFilters(f.filters ?? {}))}
                title={`${t("x.sf.apply")} — ${f.name}`}
                aria-label={`${t("x.sf.apply")} ${f.name}`}
              >
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {Object.keys(f.filters ?? {}).length}
                </span>
              </button>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-[#b0563b]"
                onClick={() => remove(f.id)}
                aria-label={`${t("x.sf.delete")} ${f.name}`}
                title={`${t("x.sf.delete")} ${f.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{t("x.sf.save")}</DialogTitle>
            <DialogDescription className="text-xs">
              {filtersActiveCount(filters)} {filtersActiveCount(filters) > 1 ? t("x.filters.active.pl") : t("x.filters.active")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sf-name" className="text-xs font-medium text-muted-foreground">{t("x.sf.name")}</Label>
            <Input
              id="sf-name"
              className="h-11 text-sm"
              placeholder={t("x.sf.namePh")}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void save() }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setSaveOpen(false)}>{t("x.sf.cancel")}</Button>
            <Button className="h-11 gap-2" onClick={() => void save()} disabled={!name.trim() || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookmarkPlus className="h-4 w-4" aria-hidden />}
              {t("x.sf.saveBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
