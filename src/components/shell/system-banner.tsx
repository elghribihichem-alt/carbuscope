"use client"

// Bannière système globale (⑧ Support & communication) : diffuse les annonces
// actives (info/attention) et l'état de maintenance sur TOUS les espaces.
// Dismissible par annonce (localStorage), le mode maintenance reste prioritaire.
import { useEffect, useState } from "react"
import { Megaphone, Wrench, X } from "lucide-react"
import type { AnnonceDTO } from "@/lib/sa-types"

const dismissKey = (id: string) => `cs-banner-off:${id}`

export function SystemBanner() {
  const [annonces, setAnnonces] = useState<AnnonceDTO[]>([])
  const [maintenance, setMaintenance] = useState<{ mode: boolean; message: string } | null>(null)
  const [dismissed, setDismissed] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      return Object.keys(window.localStorage)
        .filter(k => k.startsWith("cs-banner-off:"))
        .map(k => k.slice("cs-banner-off:".length))
    } catch {
      return []
    }
  })

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/super/annonces?banner=1", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { annonces?: AnnonceDTO[]; maintenance?: { mode: boolean; message: string } }) => {
        setAnnonces(j.annonces ?? [])
        setMaintenance(j.maintenance ?? { mode: false, message: "" })
      })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const visibles = annonces.filter(a => !dismissed.includes(a.id) && a.dissmissible !== false || !dismissed.includes(a.id))
    .filter(a => !dismissed.includes(a.id))
    .filter(a => a.severite === "ATTENTION" || a.severite === "CRITIQUE")
    .slice(0, 1)
  const info = annonces.filter(a => !dismissed.includes(a.id) && a.severite === "INFO" && a.dissmissible).slice(0, 1)

  const dismiss = (id: string) => {
    try { localStorage.setItem(dismissKey(id), "1") } catch { /* noop */ }
    setDismissed(d => [...d, id])
  }

  if (maintenance?.mode) {
    return (
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="alert">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
          <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="font-semibold">Maintenance en cours</span>
          <span className="text-amber-800 dark:text-amber-300">{maintenance.message || "La plateforme est en mode maintenance."}</span>
        </div>
      </div>
    )
  }

  const a = visibles[0] ?? info[0]
  if (!a) return null

  const style =
    a.severite === "CRITIQUE"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      : a.severite === "ATTENTION"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"

  return (
    <div className={`border-b px-4 py-1.5 text-xs ${style}`} role="status">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
        <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-semibold">{a.titre}</span>
        <span className="hidden min-w-0 flex-1 truncate sm:inline">{a.corps}</span>
        <span className="sm:hidden">{a.dateFin ? "→ fin annoncée" : ""}</span>
        {a.dissmissible && (
          <button
            className="ml-auto flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => dismiss(a.id)}
            aria-label="Masquer l'annonce"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
