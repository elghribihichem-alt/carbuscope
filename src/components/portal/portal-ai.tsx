"use client"

// Portail Enseigne — F-1 : assistant IA de l'enseigne (chat réel, émeraude).
// Adaptation de sa-ai.tsx (E-1, Super Administration) à l'identité du Portail
// Enseigne — AUCUN violet ici, l'espace enseigne est émeraude — et au périmètre
// multi-tenant : chaque question part vers /api/portal/ai?brand=<slug> (route
// serveur qui n'injecte que les données de CETTE enseigne avant d'appeler le
// moteur IA), l'historique local est renvoyé pour le multi-tour, et chaque
// consultation est tracée au journal d'audit (module AGENT_IA). Le composant
// est remonté via key={brandSlug} quand l'enseigne connectée change.

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Bot, Send, Loader2, RotateCcw, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Questions d'amorce ancrées sur les données réellement disponibles dans le
// contexte scoped (réseau, veille, réputation, abonnement SaaS, marché).
// ---------------------------------------------------------------------------
const QUESTIONS_SUGGEREES = [
  "Quelles alertes actives sur mon réseau ?",
  "Comment évolue ma note moyenne et mes réponses aux avis ?",
  "Où en est mon abonnement CarbuScope ?",
  "Comment se positionne mon réseau sur le marché ?",
] as const

// ---------------------------------------------------------------------------
// Types locaux du chat (mêmes formes que sa-ai.tsx)
// ---------------------------------------------------------------------------
interface MessageChat {
  role: "user" | "assistant"
  content: string
  heure: string
}

interface ErreurChat {
  texte: string
  question: string
}

const fHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" })
const heureCourante = () => fHeure.format(new Date())

// ---------------------------------------------------------------------------
// Composant — Assistant IA du Portail Enseigne (bêta, émeraude)
// ---------------------------------------------------------------------------
export function PortalAi({ brandSlug, brandName }: { brandSlug: string; brandName: string }) {
  const [messages, setMessages] = useState<MessageChat[]>([])
  const [saisie, setSaisie] = useState("")
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<ErreurChat | null>(null)
  const [limiteActive, setLimiteActive] = useState(false)

  const saisieRef = useRef<HTMLTextAreaElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Défilement automatique en bas de fil (aucun setState dans cet effet).
  useEffect(() => {
    const el = listeRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, erreur])

  /** Envoie la question à /api/portal/ai?brand=<slug> (chemin relatif, jamais
   *  de port). `ajouterBulle` : false lors d'un Réessayer — la bulle user
   *  échouée est déjà affichée, on l'exclut alors de l'historique envoyé. */
  const envoyer = async (questionBrute: string, ajouterBulle = true) => {
    const question = questionBrute.trim()
    if (!question || busy || limiteActive) return
    setErreur(null)
    setBusy(true)
    if (ajouterBulle) {
      setMessages(m => [...m, { role: "user", content: question, heure: heureCourante() }])
      setSaisie("")
    }
    // Historique : 8 derniers messages AVANT la question courante (borne API) ;
    // en réessai, le dernier message user correspond à la question renvoyée.
    const base = ajouterBulle
      ? messages
      : messages.at(-1)?.role === "user"
        ? messages.slice(0, -1)
        : messages
    const historique = base.slice(-8).map(({ role, content }) => ({ role, content }))

    const ac = new AbortController()
    abortRef.current = ac
    const minuteur = setTimeout(() => ac.abort(), 60_000)
    try {
      const res = await fetch(`/api/portal/ai?brand=${encodeURIComponent(brandSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, historique }),
        signal: ac.signal,
      })
      const j = (await res.json().catch(() => null)) as { reponse?: string; erreur?: string } | null
      const reponse = j?.reponse
      if (res.ok && typeof reponse === "string" && reponse.length > 0) {
        setMessages(m => [...m, { role: "assistant", content: reponse, heure: heureCourante() }])
      } else {
        if (res.status === 429) {
          setLimiteActive(true)
          setTimeout(() => setLimiteActive(false), 60_000)
        }
        setErreur({ texte: j?.erreur ?? "Le service IA est momentanément indisponible — réessayez.", question })
      }
    } catch (e) {
      const texte = e instanceof DOMException && e.name === "AbortError"
        ? "Délai dépassé (60 s) — réessayez."
        : "Le service IA est momentanément indisponible — réessayez."
      setErreur({ texte, question })
    } finally {
      clearTimeout(minuteur)
      abortRef.current = null
      setBusy(false)
      saisieRef.current?.focus()
    }
  }

  const reinitialiser = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setErreur(null)
    setLimiteActive(false)
    setSaisie("")
    saisieRef.current?.focus()
  }

  const reessayer = () => {
    const question = erreur?.question
    if (!question) return
    setErreur(null)
    void envoyer(question, false)
  }

  const envoyerSaisie = () => {
    void envoyer(saisie)
  }

  return (
    <div className="space-y-4">
      {/* En-tête de l'assistant — identité émeraude du Portail Enseigne */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Bot className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold leading-tight">
                Assistant IA — {brandName}
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                >
                  BÊTA
                </Badge>
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Votre copilote de données : alertes du réseau, réputation, abonnement CarbuScope —
                réponses ancrées sur les données de votre enseigne uniquement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversation réelle (périmètre : les données de l'enseigne connectée) */}
      <section aria-labelledby="portal-ai-chat">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle id="portal-ai-chat" className="flex items-center gap-2 text-sm">
                <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Conversation avec l&apos;assistant
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground" aria-live="polite">
                  {messages.length} message{messages.length > 1 ? "s" : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={reinitialiser}
                  disabled={messages.length === 0 && !erreur && !busy}
                  aria-label="Réinitialiser la conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réinitialiser
                </Button>
              </div>
            </div>
            <CardDescription>
              Chaque question est envoyée à la route serveur{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/api/portal/ai</code>, qui injecte un
              instantané des données de {brandName} avant d&apos;appeler le moteur IA — l&apos;historique de la
              conversation est renvoyé pour le multi-tour.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div
              ref={listeRef}
              role="log"
              aria-live="polite"
              aria-label="Fil de conversation avec l'assistant IA"
              className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4"
            >
              {messages.length === 0 && !busy && !erreur && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                    <Bot className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="text-sm font-medium">Posez votre première question</p>
                  <p className="max-w-sm text-xs leading-relaxed">
                    L&apos;assistant répond en français à partir des données de {brandName} (réseau, alertes,
                    avis, abonnement) — ou utilisez une question suggérée ci-dessous.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={`${m.heure}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg border border-l-4 p-3",
                      m.role === "user"
                        ? "border-l-emerald-500 border-emerald-200 bg-emerald-50/70 dark:border-l-emerald-500 dark:border-emerald-900 dark:bg-emerald-950/40"
                        : "border-l-slate-400 border-slate-200 bg-background dark:border-l-slate-600 dark:border-slate-800 dark:bg-slate-900",
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.role === "user" ? (
                        "Vous"
                      ) : (
                        <>
                          <Bot className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden /> Assistant IA
                        </>
                      )}
                      <span className="ml-2 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                        {m.heure}
                      </span>
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg border border-l-4 border-l-slate-400 border-slate-200 bg-background p-3 dark:border-l-slate-600 dark:border-slate-800 dark:bg-slate-900">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden />
                      L&apos;assistant analyse vos données…
                    </p>
                  </div>
                </div>
              )}

              {erreur && (
                <div className="flex justify-start">
                  <div
                    role="alert"
                    className="max-w-[85%] rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50"
                  >
                    <p className="text-sm leading-relaxed text-red-700 dark:text-red-400">{erreur.texte}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      onClick={reessayer}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réessayer
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Zone de saisie + envoi */}
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  ref={saisieRef}
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      envoyerSaisie()
                    }
                  }}
                  maxLength={500}
                  rows={2}
                  aria-label="Votre question à l'assistant IA"
                  placeholder="Posez une question sur votre réseau, vos avis, votre abonnement CarbuScope…"
                  className="w-full resize-none"
                />
                <Button
                  onClick={envoyerSaisie}
                  disabled={busy || !saisie.trim() || limiteActive}
                  className="h-auto min-h-[2.75rem] shrink-0 bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                  aria-label="Envoyer la question à l'assistant IA"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  Envoyer
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span aria-live="polite">{saisie.length}/500 caractères</span>
                {limiteActive && (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    Quota atteint — nouvelle tentative possible dans une minute.
                  </span>
                )}
              </div>

              {/* Questions suggérées */}
              <div className="flex flex-wrap gap-1.5" aria-label="Questions suggérées">
                {QUESTIONS_SUGGEREES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void envoyer(q)}
                    disabled={busy || limiteActive}
                    className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:pointer-events-none disabled:opacity-50 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="my-4" />

            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>
                Réponses générées par IA ancrées sur les données propres de {brandName} — aucune donnée des
                autres enseignes n&apos;est consultable. Vérifiez les chiffres dans vos onglets.
                Consultations tracées.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
