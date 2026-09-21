'use client'

// CarbuScope — Champ « Recherche enseigne » à saisie semi-automatique (T27) :
// suggestions filtrées en direct (nom, point couleur, nb de stations),
// navigation clavier (↑ ↓ Entrée Échap), sélection multiple par clic.

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"
import type { BrandDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

interface BrandAutocompleteProps {
  brands: BrandDTO[]
  selected: string[]
  onToggle: (slug: string) => void
  id?: string
}

export function BrandAutocomplete({ brands, selected, onToggle, id = "recherche-enseigne" }: BrandAutocompleteProps) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const suggestions = React.useMemo(() => {
    if (!q) return brands
    return brands.filter(b =>
      b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q)
    )
  }, [brands, q])
  const shown = suggestions.slice(0, 7)

  React.useEffect(() => setHighlight(0), [q])

  // Fermeture au clic extérieur
  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const pick = (slug: string) => {
    onToggle(slug)
    setOpen(true) // reste ouvert pour cumuler les sélections
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, shown.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && shown[highlight]) {
        e.preventDefault()
        pick(shown[highlight].slug)
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Enseigne… (ex : Agil)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 pr-14 pl-8 text-sm"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query && (
            <button
              type="button"
              aria-label="Effacer la recherche enseigne"
              onClick={() => { setQuery(""); setOpen(false) }}
              className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-live="polite">
          {selected.map((slug) => {
            const b = brands.find((x) => x.slug === slug)
            if (!b) return null
            return (
              <button
                key={slug}
                type="button"
                onClick={() => onToggle(slug)}
                title={`Retirer ${b.name}`}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1.5 pl-2 text-xs transition-colors hover:bg-muted"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden />
                <span className="max-w-[110px] truncate">{b.name}</span>
                <X className="h-3 w-3 text-muted-foreground" aria-hidden />
              </button>
            )
          })}
        </div>
      )}

      {open && (
        <div
          id={`${id}-liste`}
          role="listbox"
          className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
        >
          {shown.length === 0 ? (
            <p className="px-2 py-2.5 text-center text-xs text-muted-foreground">
              Aucune enseigne ne correspond à « {query} ».
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {shown.map((b, i) => {
                const isSelected = selected.includes(b.slug)
                return (
                  <li key={b.slug}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(b.slug)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        i === highlight ? "bg-accent" : "hover:bg-accent/60",
                        isSelected && "font-medium"
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px] tabular-nums">
                        {b.stationCount}
                      </Badge>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {suggestions.length > shown.length && (
            <p className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
              {suggestions.length - shown.length} autre{suggestions.length - shown.length > 1 ? "s" : ""} — affinez la saisie.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
