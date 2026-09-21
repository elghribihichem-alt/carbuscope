"use client"

// Super Administration — E-1 : l'agent IA est ACTIVÉ.
// Le cadre documentaire historique (B-4, zéro appel réseau) devient une
// interface de conversation réelle : chaque question part vers /api/super/ai
// (route serveur dédiée qui injecte un snapshot des données réelles du
// portefeuille AVANT d'appeler le moteur IA), l'historique local est renvoyé
// pour le multi-tour, et chaque consultation est tracée au journal d'audit
// (module AGENT_IA, onglet Audit). Les phases d'autonomie et d'exécution
// d'actions restent honnêtement « prévues » — ton bêta assumé.

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Bot, Sparkles, Send, Loader2, RotateCcw, ArrowRight, Check, Circle,
  ShieldAlert, Database, Wrench, ScrollText,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Constantes — date d'activation (route /api/super/ai livrée par E-1) et
// questions d'amorce ancrées sur les données réellement disponibles.
// ---------------------------------------------------------------------------
const DATE_ACTIVATION = "20 septembre 2026"

const QUESTIONS_SUGGEREES = [
  "Résume l'état du portefeuille clients",
  "Quels retards de paiement dois-je traiter en priorité ?",
  "Quelles échéances approchent ?",
  "Combien de tickets support sont ouverts ?",
] as const

// ---------------------------------------------------------------------------
// Roadmap de l'agent — la phase « connecteur LLM + contexte données » est
// LIVRÉE (cette livraison), les suivantes restent prévues.
// ---------------------------------------------------------------------------
const PHASES = [
  {
    icone: Database,
    titre: "Connecteur LLM + contexte données",
    livree: true,
    texte: `Activé le ${DATE_ACTIVATION} en démonstration — appels réels au moteur IA, réponses ancrées sur les données de la plateforme.`,
  },
  {
    icone: Sparkles,
    titre: "Autonomie planifiée",
    livree: false,
    texte: "L'agent signalera de lui-même les anomalies du portefeuille (échéances critiques, dérive des retards) sans sollicitation — veille périodique à cadencer.",
  },
  {
    icone: Wrench,
    titre: "Exécution d'actions validées",
    livree: false,
    texte: "Relances, transitions de contrat, génération de factures : proposées par l'agent, exécutées uniquement après validation humaine.",
  },
] as const

// ---------------------------------------------------------------------------
// Garde-fous actifs (côté serveur) — rappelés ici pour rester honnête.
// ---------------------------------------------------------------------------
const GARDE_FOUS = [
  "Réponses bornées aux données du portefeuille fournies au moteur — aucun chiffre inventé, refus explicite si l'information manque.",
  "Quota de consultation : 15 requêtes par minute (fenêtre glissante), au-delà la saisie est suspendue une minute.",
  "Chaque consultation est tracée au journal d'audit, module « AGENT_IA » (onglet Audit).",
] as const

// ---------------------------------------------------------------------------
// Types locaux du chat
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
// Module — Agent IA CarbuScope (bêta ACTIVÉ, chat réel)
// ---------------------------------------------------------------------------
export function SaAi() {
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

  /** Envoie la question à /api/super/ai (chemin relatif, jamais de port).
   *  `ajouterBulle` : false lors d'un Réessayer — la bulle user échouée est
   *  déjà affichée, on l'exclut alors de l'historique envoyé. */
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
      const res = await fetch("/api/super/ai", {
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
      {/* Hero — graphite/violet, bêta activé */}
      <section
        aria-labelledby="ai-titre"
        className="overflow-hidden rounded-lg border border-violet-200 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/60 text-slate-100 shadow-sm dark:border-violet-900"
      >
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
              <Bot className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="ai-titre" className="flex flex-wrap items-center gap-2 text-lg font-bold leading-tight text-white">
                Agent IA CarbuScope
                <Badge className="gap-1 border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/20">
                  <Sparkles className="h-3 w-3" aria-hidden /> Bêta — actif
                </Badge>
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-300">
                L’assistant conversationnel de la Super Administration est activé : il répond en
                français, en langage naturel, sur le portefeuille clients, la facturation, les
                échéances et le support — à partir des données réelles de la plateforme, recalculées
                à chaque consultation. L’autonomie et l’exécution d’actions restent à venir.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Moteur IA branché — réponses ancrées sur les données réelles
          </div>
        </div>
      </section>

      {/* Conversation réelle */}
      <section aria-labelledby="ai-chat">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle id="ai-chat" className="flex items-center gap-2 text-sm">
                <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Conversation avec l’agent
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
              Chaque question est envoyée à la route serveur <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/api/super/ai</code>,
              qui injecte un instantané des données du portefeuille avant d’appeler le moteur IA —
              l’historique de la conversation est renvoyé pour le multi-tour.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div
              ref={listeRef}
              role="log"
              aria-live="polite"
              aria-label="Fil de conversation avec l’agent IA"
              className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4"
            >
              {messages.length === 0 && !busy && !erreur && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                    <Bot className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="text-sm font-medium">Posez votre première question</p>
                  <p className="max-w-sm text-xs leading-relaxed">
                    L’agent répond en français à partir des données réelles du portefeuille
                    (clients, revenus, retards, échéances, support) — ou utilise une question
                    suggérée ci-dessous.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={`${m.heure}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg border border-l-4 p-3",
                      m.role === "user"
                        ? "border-l-violet-500 border-violet-200 bg-violet-50/70 dark:border-l-violet-500 dark:border-violet-900 dark:bg-violet-950/40"
                        : "border-l-slate-400 border-slate-200 bg-background dark:border-l-slate-600 dark:border-slate-800 dark:bg-slate-900",
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {m.role === "user" ? (
                        "Vous"
                      ) : (
                        <>
                          <Bot className="h-3 w-3 text-violet-500" aria-hidden /> Agent IA
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
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-hidden />
                      L’agent analyse le portefeuille…
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
                  aria-label="Votre question à l’agent IA"
                  placeholder="Posez une question sur le portefeuille, les retards de paiement, les échéances…"
                  className="w-full resize-none"
                />
                <Button
                  onClick={envoyerSaisie}
                  disabled={busy || !saisie.trim() || limiteActive}
                  className="h-auto min-h-[2.75rem] shrink-0 bg-violet-600 text-white hover:bg-violet-700 sm:w-auto"
                  aria-label="Envoyer la question à l’agent IA"
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
                    className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-violet-300 hover:text-violet-700 disabled:pointer-events-none disabled:opacity-50 dark:hover:border-violet-700 dark:hover:text-violet-400"
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
                Réponses générées par IA ancrées sur les données réelles de la plateforme — vérifiez
                les chiffres dans les modules. Consultations tracées au journal d’audit.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Roadmap de l'agent — phases et statuts honnêtes */}
      <section aria-labelledby="ai-phases">
        <h3 id="ai-phases" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Roadmap de l’agent
        </h3>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ol className="grid gap-3 lg:grid-cols-3">
              {PHASES.map((phase, i) => {
                const Icone = phase.icone
                return (
                  <li key={phase.titre} className="relative">
                    <Card className={cn("h-full", phase.livree ? "" : "border-dashed")}>
                      <CardContent className="flex h-full flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              phase.livree
                                ? "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400",
                            )}
                          >
                            <Icone className="h-4 w-4" aria-hidden />
                          </span>
                          {phase.livree ? (
                            <Badge className="gap-1 border-violet-400/60 bg-violet-500/10 text-violet-700 hover:bg-violet-500/10 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
                              <Check className="h-3 w-3" aria-hidden /> Livrée
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              prévue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold leading-snug">
                          <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                          {phase.titre}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{phase.texte}</p>
                      </CardContent>
                    </Card>
                    {i < PHASES.length - 1 && (
                      <ArrowRight
                        className="absolute -right-3.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 lg:block dark:text-slate-700"
                        aria-hidden
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Garde-fous & traçabilité */}
      <section aria-labelledby="ai-gardefous">
        <h3 id="ai-gardefous" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Garde-fous &amp; traçabilité
        </h3>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ul className="space-y-2.5">
              {GARDE_FOUS.map((g) => (
                <li key={g} className="flex items-start gap-2.5 text-sm">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                    aria-hidden
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="leading-relaxed">{g}</span>
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-sm">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500"
                  aria-hidden
                >
                  <Circle className="h-2.5 w-2.5" />
                </span>
                <span className="leading-relaxed text-muted-foreground">
                  Phase d’exécution d’actions : verrouillée jusqu’à la mise en place de la
                  validation humaine systématique (double contrôle).
                </span>
              </li>
            </ul>
            <Separator className="my-4" />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <ScrollText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Les consultations de l’agent apparaissent dans l’onglet <strong className="mx-1 font-semibold text-foreground">Audit</strong>{" "}
                sous le module <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">AGENT_IA</code> —
                question tronquée en cible, longueur de réponse et taille d’historique en détails.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
