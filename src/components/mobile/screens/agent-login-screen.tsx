'use client'

// CarbuScope Mobile — Espace agent : connexion par code (T28)
// Champ code en mono majuscules, erreur inline, chips de codes de démo.
// GET /api/missions?agentCode=… — l'agent est identifié via agents[] de la réponse.

import { useState } from "react"
import { AlertTriangle, Fuel, KeyRound, Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AgentApi } from "../agent-shared"
import { AgentBand } from "../agent-shared"

const DEMO_CODES = ["AGIL-TUN-01", "TOT-TUN-03", "SHE-TUN-05", "OLA-GBS-06", "AGIL-SFX-02", "TOT-SOU-04"]

export function AgentLoginScreen({ api }: { api: AgentApi }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const c = code.trim().toUpperCase()
    if (!c) {
      setError("Saisissez votre code agent.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.login(c) // navigue vers agent-home en cas de succès
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible — réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand title="Connexion" subtitle="Veille terrain de votre enseigne" onBack={api.back} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-6">
        <div className="mx-auto w-full max-w-[300px]">
          {/* Logo + titre */}
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/25 ring-1 ring-emerald-700/40">
              <Fuel className="h-8 w-8" />
            </span>
            <h2 className="mt-3 text-[18px] font-extrabold tracking-tight text-slate-800">Espace agent</h2>
            <p className="mt-1 text-[11.5px] leading-snug text-slate-500">
              Missions de contrôle et veille concurrentielle de votre enseigne.
              Connectez-vous avec le code fourni par votre superviseur.
            </p>
          </div>

          {/* Formulaire */}
          <form
            className="mt-5"
            onSubmit={e => {
              e.preventDefault()
              if (!busy) void submit()
            }}
          >
            <label htmlFor="agent-code" className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
              <KeyRound className="h-3.5 w-3.5" />
              Code agent
            </label>
            <Input
              id="agent-code"
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                if (error) setError(null)
              }}
              placeholder="ex : TOT-TUN-03"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "agent-code-error" : undefined}
              className={cn(
                "h-12 rounded-xl border-slate-200 bg-white text-center font-mono text-[16px] font-bold uppercase tracking-[0.16em] shadow-sm",
                "focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30",
                error && "border-red-400 focus-visible:border-red-400 focus-visible:ring-red-400/20"
              )}
            />
            {error && (
              <p id="agent-code-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="mt-3 h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {busy ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          {/* Codes de démonstration */}
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white/70 p-3">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Codes de démonstration</p>
            <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
              {DEMO_CODES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCode(c)
                    setError(null)
                  }}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] font-semibold text-slate-500 transition-all hover:border-emerald-400 hover:text-emerald-700 active:scale-95"
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-center text-[9px] italic leading-snug text-slate-400">
              Astuce : AGIL-TUN-01 dispose de missions en cours.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
