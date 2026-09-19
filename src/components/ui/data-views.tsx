"use client"

// CarbuScope — DataViews : affichage universel multi-vues pour TOUS les tableaux
// de la plateforme. Trois vues commutables (persistées par localStorage) :
//   • "table"  — vue tableau classique (en-tête teinté enseigne/émeraude)
//   • "cards"  — vue cartes (grille responsive, titre + paires libellé/valeur)
//   • "nested" — vue tableau imbriqué / arborescent (groupes repliables)
// Tri par colonne optionnel, colonnes masquables par vue, carte personnalisable.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, LayoutGrid, ListTree, Rows3,
} from "lucide-react"

export type DataViewColumn<T> = {
  /** identifiant de colonne (stable, utilisé pour le tri) */
  key: string
  /** libellé d'en-tête */
  header: React.ReactNode
  /** rendu de la cellule / de la valeur */
  render?: (row: T) => React.ReactNode
  /** valeur de tri ( nombre recommandé ; string acceptée) */
  sortValue?: (row: T) => string | number
  align?: "left" | "right" | "center"
  /** classes additionnelles du th / td */
  className?: string
  /** masquer la colonne en vue cartes */
  hideInCards?: boolean
  /** masquer la colonne dans le contenu des groupes (vue nested) */
  hideInNested?: boolean
  /** en vue cartes : libellé de la paire clé/valeur (défaut : header) */
  cardLabel?: React.ReactNode
}

export type DataViewsNested<T> = {
  /** clé de regroupement des lignes */
  groupKey: (row: T) => string
  /** rendu de l'en-tête de groupe (défaut : la clé) */
  groupLabel?: (groupKey: string, rows: T[]) => React.ReactNode
  /** tri des groupes (défaut : alpha sur la clé) */
  groupSortValue?: (groupKey: string, rows: T[]) => string | number
  /** colonne redundante à masquer dans les groupes (key de colonne) */
  hideColumnKeyInGroups?: string
  /** groupes ouverts par défaut (défaut : le premier) */
  defaultOpen?: "first" | "all" | "none"
}

export type DataViewMode = "table" | "cards" | "nested"

const MODE_LABELS: Record<DataViewMode, string> = {
  table: "Tableau",
  cards: "Cartes",
  nested: "Arborescence",
}

const MODE_ICONS: Record<DataViewMode, React.ComponentType<{ className?: string }>> = {
  table: Rows3,
  cards: LayoutGrid,
  nested: ListTree,
}

interface DataViewsProps<T> {
  columns: Array<DataViewColumn<T>>
  rows: T[]
  rowKey: (row: T) => string
  /** carte entièrement personnalisée (défaut : paires libellé/valeur) */
  renderCard?: (row: T) => React.ReactNode
  /** grille de la vue cartes (défaut 1) */
  cardColumns?: 1 | 2 | 3
  /** configuration du regroupement — active la vue nested */
  nested?: DataViewsNested<T>
  /** clé de persistance de la vue choisie */
  viewKey?: string
  /** message quand rows est vide */
  emptyMessage?: React.ReactNode
  /** hauteur max scrollable pour la vue tableau (ex. "max-h-96") */
  maxHeightClassName?: string
  /** désactiver le tri par colonne */
  sortDisabled?: boolean
  /** clic sur une ligne */
  onRowClick?: (row: T) => void
  className?: string
  /** contenu additionnel à droite du commutateur de vues */
  toolbarExtra?: React.ReactNode
}

function readStoredView(viewKey?: string): DataViewMode | null {
  if (!viewKey || typeof window === "undefined") return null
  try {
    const v = window.localStorage.getItem(`cs-dataview:${viewKey}`)
    if (v === "table" || v === "cards" || v === "nested") return v
  } catch { /* localStorage indisponible */ }
  return null
}

export function DataViews<T>({
  columns,
  rows,
  rowKey,
  renderCard,
  cardColumns = 1,
  nested,
  viewKey,
  emptyMessage = "Aucune donnée à afficher.",
  maxHeightClassName,
  sortDisabled = false,
  onRowClick,
  className,
  toolbarExtra,
}: DataViewsProps<T>) {
  const [view, setView] = React.useState<DataViewMode>(() => readStoredView(viewKey) ?? (nested ? "nested" : "table"))
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null)

  React.useEffect(() => {
    if (!viewKey || typeof window === "undefined") return
    try {
      window.localStorage.setItem(`cs-dataview:${viewKey}`, view)
    } catch { /* noop */ }
  }, [view, viewKey])

  // La vue nested n'est proposée que si un regroupement est configuré
  const modes: DataViewMode[] = nested ? ["table", "cards", "nested"] : ["table", "cards"]

  const sortedRows = React.useMemo(() => {
    if (!sort || sortDisabled) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const mult = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult
      return String(va).localeCompare(String(vb), "fr") * mult
    })
  }, [rows, sort, columns, sortDisabled])

  const groups = React.useMemo(() => {
    if (view !== "nested" || !nested) return []
    const map = new Map<string, T[]>()
    for (const r of sortedRows) {
      const k = nested.groupKey(r)
      const arr = map.get(k)
      if (arr) arr.push(r)
      else map.set(k, [r])
    }
    let list = Array.from(map.entries())
    if (nested.groupSortValue) {
      const mult = sort?.dir === "desc" ? -1 : 1
      const gs = nested.groupSortValue
      list = list.sort(([ka, ra], [kb, rb]) => {
        const va = gs(ka, ra)
        const vb = gs(kb, rb)
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult
        return String(va).localeCompare(String(vb), "fr") * mult
      })
    } else {
      list = list.sort(([ka], [kb]) => ka.localeCompare(kb, "fr"))
    }
    return list
  }, [view, nested, sortedRows, sort])

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({})
  React.useEffect(() => {
    if (view !== "nested" || !nested || groups.length === 0) return
    const mode = nested.defaultOpen ?? "first"
    if (mode === "all") setOpenGroups(Object.fromEntries(groups.map(([k]) => [k, true])))
    else if (mode === "first") setOpenGroups({ [groups[0][0]]: true })
    else setOpenGroups({})
  }, [view, nested, groups])

  const toggleSort = (key: string) => {
    if (sortDisabled) return
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null
    )
  }

  const cardsCols = renderCard ? "grid-cols-1" : (
    cardColumns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" :
    cardColumns === 2 ? "sm:grid-cols-2" :
    "grid-cols-1"
  )

  const visibleCardCols = columns.filter((c) => !c.hideInCards)
  const groupCols = nested?.hideColumnKeyInGroups
    ? columns.filter((c) => c.key !== nested.hideColumnKeyInGroups)
    : columns

  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left"

  return (
    <div className={cn("space-y-3", className)}>
      {/* ---------- Barre d'outils : commutateur de vues ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Mode d'affichage des données"
          className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5"
        >
          {modes.map((m) => {
            const Icon = MODE_ICONS[m]
            const active = view === m
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                title={`Vue ${MODE_LABELS[m].toLowerCase()}`}
                onClick={() => setView(m)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{MODE_LABELS[m]}</span>
              </button>
            )
          })}
        </div>
        {toolbarExtra}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : view === "table" ? (
        /* ---------- Vue 1 : tableau classique, en-tête teinté ---------- */
        <div className={cn("overflow-x-auto rounded-lg border", maxHeightClassName)}>
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-b border-primary/20 bg-primary/10 hover:bg-primary/10">
                {columns.map((c) => {
                  const sortable = !sortDisabled && !!c.sortValue
                  const activeSort = sort?.key === c.key
                  const SortIcon = !sortable ? null : activeSort ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
                  return (
                    <TableHead
                      key={c.key}
                      className={cn(
                        "text-primary align-middle",
                        alignCls(c.align),
                        sortable && "cursor-pointer select-none hover:text-primary/80",
                        c.className
                      )}
                      onClick={() => sortable && toggleSort(c.key)}
                      aria-sort={activeSort ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.header}
                        {SortIcon && <SortIcon className={cn("h-3 w-3", !activeSort && "opacity-40")} />}
                      </span>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={cn("hover:bg-muted/40", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(alignCls(c.align), c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : view === "cards" ? (
        /* ---------- Vue 2 : cartes ---------- */
        <div className={cn("grid gap-3", cardsCols)}>
          {sortedRows.map((row) =>
            renderCard ? (
              <React.Fragment key={rowKey(row)}>{renderCard(row)}</React.Fragment>
            ) : (
              <Card key={rowKey(row)} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* 1re colonne visible = titre de la carte */}
                  {visibleCardCols.length > 0 && (
                    <p className="mb-2 text-sm font-semibold leading-snug">
                      {visibleCardCols[0].render
                        ? visibleCardCols[0].render(row)
                        : String((row as Record<string, unknown>)[visibleCardCols[0].key] ?? "")}
                    </p>
                  )}
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    {visibleCardCols.slice(1).map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {c.cardLabel ?? c.header}
                        </dt>
                        <dd className="mt-0.5 break-words text-sm">
                          {c.render
                            ? c.render(row)
                            : String((row as Record<string, unknown>)[c.key] ?? "")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )
          )}
        </div>
      ) : (
        /* ---------- Vue 3 : tableau imbriqué (groupes repliables) ---------- */
        <div className="space-y-2">
          {groups.map(([gk, grows]) => {
            const open = !!openGroups[gk]
            return (
              <Collapsible key={gk} open={open} onOpenChange={(o) => setOpenGroups((s) => ({ ...s, [gk]: o }))}>
                <div className="overflow-hidden rounded-lg border">
                  <CollapsibleTrigger className="group/w flex w-full items-center gap-2 border-b bg-primary/10 px-3 py-2.5 text-left transition-colors hover:bg-primary/15">
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-primary transition-transform", open && "rotate-90")} />
                    <span className="min-w-0 flex-1 text-sm font-semibold text-primary">
                      {nested!.groupLabel ? nested!.groupLabel(gk, grows) : gk}
                    </span>
                    <Badge variant="secondary" className="h-5 shrink-0 tabular-nums">
                      {grows.length}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            {groupCols.map((c) => (
                              <TableHead key={c.key} className={cn("h-8", alignCls(c.align), c.className)}>
                                {c.header}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grows.map((row) => (
                            <TableRow
                              key={rowKey(row)}
                              className={cn("hover:bg-muted/40", onRowClick && "cursor-pointer")}
                              onClick={onRowClick ? () => onRowClick(row) : undefined}
                            >
                              {groupCols.map((c) => (
                                <TableCell key={c.key} className={cn("py-2", alignCls(c.align), c.className)}>
                                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )
          })}
        </div>
      )}
    </div>
  )
}
