import type { Homografia } from './homografia'
import type { Ponto } from './tipos'

/**
 * Traço medido na foto: linha (aberta, 2 ou mais pontos) ou forma (fechada,
 * 3 ou mais pontos, com "dentes" quando a pessoa adiciona pontos nos lados).
 */
export interface Traco {
  pts: Ponto[]
  fechada: boolean
  /** lados com medida digitada (índice do lado → cm): o comprimento real fica travado */
  travados?: Record<number, number>
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

/* ------------------------------------------------------------ lados travados */

const sub = (a: Ponto, b: Ponto): Ponto => ({ x: a.x - b.x, y: a.y - b.y })
const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)

/** Lados travados que encostam no ponto i: [outra ponta, comprimento]. */
function travasDoPonto(t: Traco, i: number): [number, number][] {
  const segs = segmentos(t)
  return Object.entries(t.travados ?? {}).flatMap(([s, cm]) => {
    const seg = segs[Number(s)]
    if (!seg) return []
    if (seg[0] === i) return [[seg[1], cm] as [number, number]]
    if (seg[1] === i) return [[seg[0], cm] as [number, number]]
    return []
  })
}

/**
 * Leva as travas para os índices novos depois de inserir ou remover um ponto.
 * `mapa` diz para onde foi cada ponto antigo (null = removido); um lado que
 * deixou de existir (foi dividido ou unido) perde a trava.
 */
export function remapearTravas(antes: Traco, depois: Traco, mapa: (j: number) => number | null): Record<number, number> | undefined {
  if (!antes.travados) return undefined
  const velhos = segmentos(antes)
  const novos = segmentos(depois)
  const saida: Record<number, number> = {}
  for (const [s, cm] of Object.entries(antes.travados)) {
    const seg = velhos[Number(s)]
    if (!seg) continue
    const a = mapa(seg[0])
    const b = mapa(seg[1])
    if (a === null || b === null) continue
    const k = novos.findIndex(([x, y]) => x === a && y === b)
    if (k >= 0) saida[k] = cm
  }
  return Object.keys(saida).length ? saida : undefined
}

/** Dá ao lado s o comprimento real pedido, movendo a ponta final ao longo do próprio lado. */
export function aplicarComprimento(t: Traco, s: number, cm: number, H: Homografia, Hinv: Homografia): Ponto[] {
  const seg = segmentos(t)[s]
  if (!seg) return t.pts
  const A = H(t.pts[seg[0]]!)
  const B = H(t.pts[seg[1]]!)
  const d = dist(A, B) || 1
  const novo = Hinv({ x: A.x + ((B.x - A.x) / d) * cm, y: A.y + ((B.y - A.y) / d) * cm })
  return t.pts.map((p, i) => (i === seg[1] ? novo : p))
}

/**
 * Para onde o ponto i pode ir quando o dedo está em `alvo` (pixels): com um
 * lado travado ele gira em volta da outra ponta mantendo o comprimento; com
 * dois, fica no cruzamento dos dois círculos mais perto do dedo.
 */
export function restringirPonto(t: Traco, i: number, alvo: Ponto, H: Homografia, Hinv: Homografia): Ponto {
  const travas = travasDoPonto(t, i)
  if (travas.length === 0) return alvo
  const P = H(alvo)
  if (travas.length === 1) {
    const [o, cm] = travas[0]!
    const O = H(t.pts[o]!)
    const v = sub(P, O)
    const d = Math.hypot(v.x, v.y) || 1
    return Hinv({ x: O.x + (v.x / d) * cm, y: O.y + (v.y / d) * cm })
  }
  // dois lados travados: interseção de dois círculos
  const [[o1, r1], [o2, r2]] = travas as [[number, number], [number, number]]
  const C1 = H(t.pts[o1]!)
  const C2 = H(t.pts[o2]!)
  const d = dist(C1, C2)
  if (d === 0 || d > r1 + r2 || d < Math.abs(r1 - r2)) return t.pts[i]!
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a))
  const m = { x: C1.x + ((C2.x - C1.x) * a) / d, y: C1.y + ((C2.y - C1.y) * a) / d }
  const op = [
    { x: m.x + (h * (C2.y - C1.y)) / d, y: m.y - (h * (C2.x - C1.x)) / d },
    { x: m.x - (h * (C2.y - C1.y)) / d, y: m.y + (h * (C2.x - C1.x)) / d },
  ]
  return Hinv(dist(op[0]!, P) <= dist(op[1]!, P) ? op[0]! : op[1]!)
}

/** Move o lado s inteiro (as duas pontas juntas) pelo deslocamento real `delta`, sem mudar o comprimento. */
export function transladarLado(pts0: Ponto[], seg: [number, number], delta: Ponto, H: Homografia, Hinv: Homografia): Ponto[] {
  return pts0.map((p, i) => {
    if (i !== seg[0] && i !== seg[1]) return p
    const R = H(p)
    return Hinv({ x: R.x + delta.x, y: R.y + delta.y })
  })
}

/** Reaplica as medidas digitadas (quando a referência muda, os pixels ficam e o tamanho real muda). */
export function reaplicarTravas(t: Traco, H: Homografia, Hinv: Homografia): Traco {
  if (!t.travados) return t
  let atual = t
  for (const [s, cm] of Object.entries(t.travados)) {
    const m = medirTraco(H, atual)
    if (m && Math.abs((m.lados[Number(s)] ?? cm) - cm) > 0.05) atual = { ...atual, pts: aplicarComprimento(atual, Number(s), cm, H, Hinv) }
  }
  return atual
}
