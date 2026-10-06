import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { contornoExterno, limites, mover, pontoNoPoligono } from '@/lib/geometria'
import type { Comodo, Ponto, Projeto } from '@/lib/tipos'
import { DesenhoPlanta } from './DesenhoPlanta'

interface Vista {
  x: number
  y: number
  w: number
  h: number
}

type Arrasto =
  | { tipo: 'pan'; tela: Ponto; vista: Vista; moveu: boolean }
  | { tipo: 'comodo'; id: string; inicio: Ponto; pontos: Ponto[] }
  | { tipo: 'vertice'; id: string; indice: number }
  | { tipo: 'pinca'; dist: number; meio: Ponto; vista: Vista }

export interface PlantaApi {
  enquadrar: () => void
}

interface Props {
  projeto: Projeto
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  /** chamado uma vez no começo de cada arrasto, para o desfazer */
  onInicioEdicao: () => void
  onAlterar: (p: Projeto) => void
  ref?: Ref<PlantaApi>
}

const PROXIMIDADE_PX = 10

export function Planta({ projeto, selecionado, onSelecionar, onInicioEdicao, onAlterar, ref }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [vista, setVista] = useState<Vista>({ x: -100, y: -100, w: 1000, h: 700 })
  const arrasto = useRef<Arrasto | null>(null)
  const toques = useRef(new Map<number, Ponto>())
  const projetoRef = useRef(projeto)
  projetoRef.current = projeto

  const tamanho = () => {
    const r = svgRef.current?.getBoundingClientRect()
    return { w: r?.width || 1, h: r?.height || 1, left: r?.left ?? 0, top: r?.top ?? 0 }
  }
  const cmPorPx = vista.w / tamanho().w

  const naPlanta = useCallback(
    (cx: number, cy: number, v: Vista = vista): Ponto => {
      const t = tamanho()
      return { x: v.x + ((cx - t.left) / t.w) * v.w, y: v.y + ((cy - t.top) / t.h) * v.h }
    },
    [vista],
  )

  const enquadrar = useCallback(() => {
    const t = tamanho()
    const b = limites(projetoRef.current.comodos, projetoRef.current.espessuraParede)
    const margem = 110
    let w = b.maxX - b.minX + 2 * margem
    let h = b.maxY - b.minY + 2 * margem
    if (w / h < t.w / t.h) w = (h * t.w) / t.h
    else h = (w * t.h) / t.w
    setVista({ x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - h / 2, w, h })
  }, [])

  useImperativeHandle(ref, () => ({ enquadrar }), [enquadrar])

  // mantém a proporção da vista igual à da tela
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const t = tamanho()
      setVista((v) => ({ ...v, h: (v.w * t.h) / t.w }))
    })
    obs.observe(el)
    enquadrar()
    return () => obs.disconnect()
  }, [enquadrar])

  // zoom com a roda do mouse, centrado no cursor
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const roda = (e: WheelEvent) => {
      e.preventDefault()
      setVista((v) => {
        const k = Math.exp(e.deltaY * 0.0015)
        const w = Math.min(Math.max(v.w * k, 100), 20000)
        const f = w / v.w
        const p = naPlanta(e.clientX, e.clientY, v)
        return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w, h: v.h * f }
      })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [naPlanta])

  const trocarComodo = (id: string, f: (c: Comodo) => Comodo) => {
    const p = projetoRef.current
    onAlterar({ ...p, comodos: p.comodos.map((c) => (c.id === id ? f(c) : c)) })
  }

  /** Encaixe ao arrastar um cômodo: alinha cantos (internos e externos) com os dos outros. */
  const encaixar = (id: string, pontos: Ponto[], delta: Ponto): Ponto => {
    const p = projetoRef.current
    const t = p.espessuraParede
    const tol = PROXIMIDADE_PX * cmPorPx
    const meus = [...pontos, ...contornoExterno(pontos, t)].map((q) => ({ x: q.x + delta.x, y: q.y + delta.y }))
    const outros = p.comodos.filter((c) => c.id !== id).flatMap((c) => [...c.pontos, ...contornoExterno(c.pontos, t)])
    let melhorX: number | null = null
    let melhorY: number | null = null
    for (const a of meus) {
      for (const b of outros) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (Math.abs(dx) < tol && (melhorX === null || Math.abs(dx) < Math.abs(melhorX))) melhorX = dx
        if (Math.abs(dy) < tol && (melhorY === null || Math.abs(dy) < Math.abs(melhorY))) melhorY = dy
      }
    }
    return {
      x: melhorX !== null ? delta.x + melhorX : Math.round(delta.x),
      y: melhorY !== null ? delta.y + melhorY : Math.round(delta.y),
    }
  }

  const aoPressionar = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId)
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (toques.current.size === 2) {
      const [a, b] = [...toques.current.values()] as [Ponto, Ponto]
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      arrasto.current = { tipo: 'pinca', dist: Math.hypot(a.x - b.x, a.y - b.y), meio: naPlanta(meio.x, meio.y), vista }
      return
    }
    if (toques.current.size > 2) return

    const p = naPlanta(e.clientX, e.clientY)
    const proj = projetoRef.current
    const raio = 9 * cmPorPx

    const sel = proj.comodos.find((c) => c.id === selecionado)
    if (sel) {
      const indice = sel.pontos.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= raio)
      if (indice >= 0) {
        onInicioEdicao()
        arrasto.current = { tipo: 'vertice', id: sel.id, indice }
        return
      }
    }
    // o último desenhado fica por cima: procura de trás para frente
    const alvo = [...proj.comodos]
      .reverse()
      .find((c) => pontoNoPoligono(p, c.pontos) || pontoNoPoligono(p, contornoExterno(c.pontos, proj.espessuraParede)))
    if (alvo) {
      onSelecionar(alvo.id)
      onInicioEdicao()
      arrasto.current = { tipo: 'comodo', id: alvo.id, inicio: p, pontos: alvo.pontos }
      return
    }
    arrasto.current = { tipo: 'pan', tela: { x: e.clientX, y: e.clientY }, vista, moveu: false }
  }

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!toques.current.has(e.pointerId)) return
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const a = arrasto.current
    if (!a) return

    if (a.tipo === 'pinca') {
      if (toques.current.size < 2) return
      const [t1, t2] = [...toques.current.values()] as [Ponto, Ponto]
      const k = a.dist / Math.max(1, Math.hypot(t1.x - t2.x, t1.y - t2.y))
      const w = Math.min(Math.max(a.vista.w * k, 100), 20000)
      const f = w / a.vista.w
      const t = tamanho()
      const meioTela = { x: (t1.x + t2.x) / 2 - t.left, y: (t1.y + t2.y) / 2 - t.top }
      const h = a.vista.h * f
      setVista({ x: a.meio.x - (meioTela.x / t.w) * w, y: a.meio.y - (meioTela.y / t.h) * h, w, h })
      return
    }
    if (a.tipo === 'pan') {
      const t = tamanho()
      const dx = ((e.clientX - a.tela.x) / t.w) * a.vista.w
      const dy = ((e.clientY - a.tela.y) / t.h) * a.vista.h
      if (Math.abs(e.clientX - a.tela.x) + Math.abs(e.clientY - a.tela.y) > 3) a.moveu = true
      setVista({ ...a.vista, x: a.vista.x - dx, y: a.vista.y - dy })
      return
    }
    const p = naPlanta(e.clientX, e.clientY)
    if (a.tipo === 'comodo') {
      const d = encaixar(a.id, a.pontos, { x: p.x - a.inicio.x, y: p.y - a.inicio.y })
      trocarComodo(a.id, (c) => ({ ...c, pontos: mover(a.pontos, d) }))
      return
    }
    // vértice: alinha com os vizinhos quando chega perto (mantém o esquadro)
    trocarComodo(a.id, (c) => {
      const n = c.pontos.length
      const viz = [c.pontos[(a.indice - 1 + n) % n]!, c.pontos[(a.indice + 1) % n]!]
      const tol = PROXIMIDADE_PX * cmPorPx
      let x = Math.round(p.x)
      let y = Math.round(p.y)
      for (const v of viz) {
        if (Math.abs(v.x - p.x) < tol) x = v.x
        if (Math.abs(v.y - p.y) < tol) y = v.y
      }
      return { ...c, pontos: c.pontos.map((q, i) => (i === a.indice ? { x, y } : q)) }
    })
  }

  const aoSoltar = (e: React.PointerEvent<SVGSVGElement>) => {
    toques.current.delete(e.pointerId)
    const a = arrasto.current
    if (a?.tipo === 'pan' && !a.moveu) onSelecionar(null)
    arrasto.current = toques.current.size === 0 ? null : a?.tipo === 'pinca' ? null : a
  }

  const sel = projeto.comodos.find((c) => c.id === selecionado)
  const caminhoSel = sel ? sel.pontos.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ') + ' Z' : ''

  return (
    <svg
      ref={svgRef}
      className="block h-full w-full touch-none select-none bg-stone-100"
      viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
      preserveAspectRatio="none"
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
    >
      <defs>
        <pattern id="grade" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M100 0H0V100" fill="none" stroke="#d6d3d1" strokeWidth={Math.max(0.5, cmPorPx * 0.8)} />
        </pattern>
      </defs>
      <rect x={vista.x} y={vista.y} width={vista.w} height={vista.h} fill="url(#grade)" />
      <DesenhoPlanta projeto={projeto} />
      {sel && (
        <g pointerEvents="none">
          <path d={caminhoSel} fill="rgba(234,88,12,0.08)" stroke="#ea580c" strokeWidth={2 * cmPorPx} strokeDasharray={`${6 * cmPorPx} ${4 * cmPorPx}`} />
          {sel.pontos.map((q, i) => (
            <circle key={i} cx={q.x} cy={q.y} r={6 * cmPorPx} fill="#fff" stroke="#ea580c" strokeWidth={2 * cmPorPx} />
          ))}
        </g>
      )}
    </svg>
  )
}
