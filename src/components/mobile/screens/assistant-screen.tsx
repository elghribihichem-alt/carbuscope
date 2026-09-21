'use client'

// CarbuScope Mobile — Copilote IA « où faire le plein » (G-1, Vague 7)
// Chat B2C ancré sur les données PUBLIQUES de CarbuScope (prix officiels du
// décret, stations actives autour de l'automobiliste, notes, services).
// Chaque question part vers /api/mobile/ai (route serveur qui injecte le
// contexte public avant d'appeler le moteur IA), l'historique est renvoyé
// pour le multi-tour, la position de démonstration (USER_POS) accompagne la
// question. UI 100 % française, identité émeraude du mobile B2C.

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Bot, Loader2, RotateCcw, Send, ShieldAlert } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { USER_POS } from "../shared"

// ---------------------------------------------------------------------------
// Questions d'amorce ancrées sur les données réellement injectées par la
// route (prix officiels, 12 stations proches, top notes, services).
// ---------------------------------------------------------------------------
const QUESTIONS_SUGGEREES = [
  "Où faire le plein pas cher autour de moi ?",
  "Quelles stations avec lavage près de moi ?",
  "Prix du gasoil aujourd'hui ?",
  "Les stations les mieux notées autour de moi",
] as const

const QUESTION_MAX = 500
const SUSPENSION_S = 60 // suspension après un 429 (fenêtre du quota serveur)

// ---------------------------------------------------------------------------
// Types locaux du chat (même forme que portal-ai.tsx)
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
// Écran « Copilote CarbuScope » — chat dans le téléphone (poussé, pas d'onglet)
// ---------------------------------------------------------------------------
export function AssistantScreen({ back }: { back: () => void }) {
  const [messages, setMessages] = useState<MessageChat[]>([])
  const [saisie, setSaisie] = useState("")
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<ErreurChat | null>(null)
  const [secRestantes, setSecRestantes] = useState(0)

  const saisieRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Défilement automatique en bas de fil (aucun setState dans cet effet).
  useEffect(() => {
    const el = listeRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, erreur])

  // Compte à rebours de la suspension 429 (une question par seconde décrémentée).
  useEffect(() => {
    if (secRestantes <= 0) return
    const id = setTimeout(() => setSecRestantes(s => s - 1), 1000)
    return () => clearTimeout(id)
  }, [secRestantes])

  /** Envoie la question à /api/mobile/ai (chemin relatif, jamais de port) avec
   *  la position de démonstration. `ajouterBulle` : false lors d'un Réessayer —
   *  la bulle user échouée est déjà affichée, on l'exclut de l'historique. */
  const envoyer = async (questionBrute: string, ajouterBulle = true) => {
    const question = questionBrute.trim()
    if (!question || busy || secRestantes > 0) return
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
    const history = base.slice(-8).map(({ role, content }) => ({ role, content }))

    const ac = new AbortController()
    abortRef.current = ac
    const minuteur = setTimeout(() => ac.abort(), 60_000)
    try {
      const res = await fetch("/api/mobile/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, lat: USER_POS.lat, lng: USER_POS.lng }),
        signal: ac.signal,
      })
      const j = (await res.json().catch(() => null)) as { reponse?: string; erreur?: string } | null
      const reponse = j?.reponse
      if (res.ok && typeof reponse === "string" && reponse.length > 0) {
        setMessages(m => [...m, { role: "assistant", content: reponse, heure: heureCourante() }])
      } else {
        // 429 : suspension locale synchronisée sur la fenêtre serveur (60 s).
        if (res.status === 429) setSecRestantes(SUSPENSION_S)
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
    setSecRestantes(0)
    setSaisie("")
    saisieRef.current?.focus()
  }

  const reessayer = () => {
    const question = erreur?.question
    if (!question || secRestantes > 0) return
    setErreur(null)
    void envoyer(question, false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      {/* Bandeau : retour, identité du copilote, badge BÊTA, réinitialisation */}
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white px-2 py-2">
        <button
          type="button"
          onClick={back}
          aria-label="Retour à la carte"
          title="Retour à la carte"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-md shadow-emerald-900/20 ring-1 ring-emerald-700/40">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 truncate text-[15px] font-bold leading-tight text-slate-800">
            Copilote CarbuScope
            <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-emerald-700">
              Bêta
            </span>
          </h1>
          <p className="truncate text-[10.5px] leading-tight text-slate-400">
            Où faire le plein ? Je connais les stations autour de vous.
          </p>
        </div>
        {messages.length >= 2 && (
          <button
            type="button"
            onClick={reinitialiser}
            aria-label="Réinitialiser la conversation"
            title="Réinitialiser la conversation"
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-emerald-700 active:bg-slate-200 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Fil de conversation */}
      <div
        ref={listeRef}
        role="log"
        aria-live="polite"
        aria-label="Fil de conversation avec le copilote IA"
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messages.length === 0 && !busy && !erreur && (
          <div className="flex flex-col items-center gap-2.5 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Bot className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-[13px] font-semibold text-slate-700">Où faire le plein ?</p>
            <p className="max-w-[250px] text-[11.5px] leading-snug text-slate-400">
              Demandez-moi les stations autour de vous, le prix du gasoil, les mieux notées
              ou celles avec un service en particulier.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={`${m.heure}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm",
                m.role === "user" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-700",
              )}
            >
              <p className="whitespace-pre-line text-[13px] leading-relaxed">{m.content}</p>
              <p
                className={cn(
                  "mt-1 text-[9.5px] leading-none tabular-nums",
                  m.role === "user" ? "text-emerald-100/80" : "text-slate-400",
                )}
              >
                {m.role === "user" ? "Vous" : "Copilote"} · {m.heure}
              </p>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <p className="flex items-center gap-2 text-[13px] text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden />
                Le copilote analyse votre demande…
              </p>
            </div>
          </div>
        )}

        {erreur && (
          <div className="flex justify-start">
            <div role="alert" className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-3 py-2 shadow-sm">
              <p className="text-[12.5px] leading-relaxed text-red-700">{erreur.texte}</p>
              {secRestantes <= 0 && (
                <button
                  type="button"
                  onClick={reessayer}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-transform active:scale-95"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Réessayer
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Questions suggérées — masquées dès le premier envoi */}
      {messages.length === 0 && (
        <div className="shrink-0 px-3 pb-1.5" aria-label="Questions suggérées">
          <div className="flex flex-wrap gap-1.5">
            {QUESTIONS_SUGGEREES.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => void envoyer(q)}
                className="rounded-full border border-emerald-300/70 bg-emerald-50/70 px-3 py-1.5 text-[11px] font-medium text-emerald-700 shadow-sm transition-all hover:border-emerald-400 hover:bg-emerald-100/70 active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Barre de saisie */}
      <div className="shrink-0 border-t border-slate-200/80 bg-white px-3 py-2">
        <form
          onSubmit={e => {
            e.preventDefault()
            if (!busy && secRestantes <= 0) void envoyer(saisie)
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor="copilote-question" className="sr-only">
            Votre question au copilote IA
          </label>
          <Input
            id="copilote-question"
            ref={saisieRef}
            value={saisie}
            onChange={e => setSaisie(e.target.value)}
            maxLength={QUESTION_MAX}
            placeholder="Où faire le plein près de moi ?"
            autoComplete="off"
            enterKeyHint="send"
            disabled={busy || secRestantes > 0}
            className="h-10 flex-1 rounded-full border-slate-200 bg-slate-50 text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
          <button
            type="submit"
            disabled={busy || !saisie.trim() || secRestantes > 0}
            aria-label="Envoyer la question au copilote IA"
            title="Envoyer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden /> : <Send className="h-4.5 w-4.5" aria-hidden />}
          </button>
        </form>
        {secRestantes > 0 && (
          <p className="mt-1.5 text-[10.5px] font-medium leading-snug text-amber-600" aria-live="polite">
            Trop de consultations — nouvelle question possible dans {secRestantes} s.
          </p>
        )}
        <p className="mt-1.5 flex items-center justify-center gap-1 text-[10.5px] leading-none text-slate-400">
          <ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
          Réponses générées par IA — vérifiez les infos avant de partir.
        </p>
      </div>
    </div>
  )
}
