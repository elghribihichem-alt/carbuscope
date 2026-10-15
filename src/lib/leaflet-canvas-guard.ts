// CarbuScope — Garde-fou Leaflet Canvas renderer (T63).
//
// Bug : « TypeError: Cannot read properties of undefined (reading 'clearRect') »
// dans leaflet/src/layer/vector/Canvas.js (_clear ← _redraw, lignes 237/247).
//
// Cause : le renderer Canvas planifie des redraws via requestAnimFrame
// (_requestRedraw, déclenché à chaque ajout/suppression/mise à jour de
// CircleMarker). Quand le composant React portant la carte se démonte
// (changement d'onglet/volet — p.ex. dashboard → « Missions terrain »),
// map.remove() → Renderer.onRemove → _destroyContainer supprime this._ctx ;
// une RAF encore pendante (ou un redraw synchrones tardif) touche alors un
// renderer détruit → _clear lit this._ctx.clearRect sur undefined.
// Race documentée de long date (react-leaflet #1223/#1234, leaflet #9241).
//
// Correctif : patch du prototype L.Canvas — _redraw ET _update deviennent des
// no-op quand _ctx a disparu (renderer détruit). Comportement strictement
// identique dans tous les autres cas (le redraw normal a toujours _ctx).
// Module à effet de bord, idempotent (__carbuscopeCanvasGuard) — importé par
// TOUS les composants carte du projet (osm-map, explorer-map, hub-map,
// shadow-map-leaflet, sa-media-map-picker) avant toute création de carte.

import * as L from "leaflet"

// Typage structurel : les membres privés du renderer ne sont pas exposés par
// @types/leaflet — on passe par une vue minimale.
interface CanvasRendererLike {
  _ctx?: CanvasRenderingContext2D | null | undefined
}

type CanvasProto = Record<string, (this: CanvasRendererLike, ...args: never[]) => void> & {
  __carbuscopeCanvasGuard?: boolean
}

const canvasProto = (L as unknown as { Canvas?: { prototype?: CanvasProto } }).Canvas?.prototype

if (canvasProto && !canvasProto.__carbuscopeCanvasGuard) {
  canvasProto.__carbuscopeCanvasGuard = true

  const ctxGone = (r: CanvasRendererLike): boolean => r._ctx === undefined || r._ctx === null

  // 1) Chemin asynchrone (RAF) : _redraw → _clear/_draw.
  const origRedraw = canvasProto._redraw
  if (typeof origRedraw === "function") {
    canvasProto._redraw = function (this: CanvasRendererLike, ...args: never[]) {
      if (ctxGone(this)) return // renderer détruit → redraw no-op
      return origRedraw.apply(this, args)
    }
  }

  // 2) Chemin synchrone (moveend → _update, qui lit/écrit _ctx.scale/translate).
  const origUpdate = canvasProto._update
  if (typeof origUpdate === "function") {
    canvasProto._update = function (this: CanvasRendererLike, ...args: never[]) {
      if (ctxGone(this)) return
      return origUpdate.apply(this, args)
    }
  }
}

// Ré-export vide : ce module s'utilise uniquement pour son effet de bord
// (« import "@/lib/leaflet-canvas-guard" »).
export {}
