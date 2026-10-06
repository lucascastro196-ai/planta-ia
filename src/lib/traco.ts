import type { Homografia } from './homografia'
import type { Ponto } from './tipos'

/**
 * Traço medido na foto: linha (aberta, 2 ou mais pontos) ou forma (fechada,
 * 3 ou mais pontos, com "dentes" quando a pessoa adiciona pontos nos lados).
 */
export interface Traco {
  pts: Ponto[]
  fechada: boolean
}

export interface MedidaTraco {
  /** comprimento de cada lado, em cm */
  lados: number[]
  /** linha: comprimento total; forma: perímetro (cm) */
  total: number
  /** só nas formas, em m² */
  area?: number
}

const arred = (n: number) => Math.round(n * 10) / 10

/** Segmentos do traço (índices de início e fim). */
export function segmentos(t: Traco): [number, number][] {
  const n = t.pts.length
  const s: [number, number][] = []
  for (let i = 0; i < n - 1; i++) s.push([i, i + 1])
  if (t.fechada && n >= 3) s.push([n - 1, 0])
  return s
}

export function medirTraco(H: Homografia | null, t: Traco): MedidaTraco | null {
  if (!H || t.pts.length < 2) return null
  const reais = t.pts.map(H)
  if (reais.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const lados = segmentos(t).map(([a, b]) => arred(Math.hypot(reais[a]!.x - reais[b]!.x, reais[a]!.y - reais[b]!.y)))
  const total = arred(lados.reduce((s, l) => s + l, 0))
  if (total > 100000) return null
  if (!t.fechada) return { lados, total }
  let dobro = 0
  for (let i = 0; i < reais.length; i++) {
    const p = reais[i]!
    const q = reais[(i + 1) % reais.length]!
    dobro += p.x * q.y - q.x * p.y
  }
  return { lados, total, area: Math.round((Math.abs(dobro) / 2 / 10000) * 100) / 100 }
}

export const centroDoTraco = (t: Traco): Ponto => ({
  x: t.pts.reduce((s, p) => s + p.x, 0) / t.pts.length,
  y: t.pts.reduce((s, p) => s + p.y, 0) / t.pts.length,
})

export const formatarArea = (m2: number) => `${m2.toFixed(2).replace('.', ',')} m²`
