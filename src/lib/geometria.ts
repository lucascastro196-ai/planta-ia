import type { Abertura, Comodo, Ponto } from './tipos'

export const soma = (a: Ponto, b: Ponto): Ponto => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Ponto, b: Ponto): Ponto => ({ x: a.x - b.x, y: a.y - b.y })
export const mult = (a: Ponto, k: number): Ponto => ({ x: a.x * k, y: a.y * k })
export const prod = (a: Ponto, b: Ponto): number => a.x * b.x + a.y * b.y
export const comp = (a: Ponto): number => Math.hypot(a.x, a.y)
export const unit = (a: Ponto): Ponto => {
  const c = comp(a)
  return c === 0 ? { x: 1, y: 0 } : mult(a, 1 / c)
}

/** Área com sinal: positiva quando os pontos giram no sentido horário na tela (y para baixo). */
export function areaComSinal(pts: Ponto[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export const areaM2 = (pts: Ponto[]) => Math.abs(areaComSinal(pts)) / 10000

export function centroide(pts: Ponto[]): Ponto {
  const a = areaComSinal(pts)
  if (Math.abs(a) < 1e-6) {
    const m = pts.reduce((acc, p) => soma(acc, p), { x: 0, y: 0 })
    return mult(m, 1 / Math.max(1, pts.length))
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % pts.length]!
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function pontoNoPoligono(p: Ponto, pts: Ponto[]): boolean {
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

export interface Parede {
  i: number
  a: Ponto
  b: Ponto
  comprimento: number
  /** direção unitária de a para b */
  d: Ponto
  /** normal unitária para fora do cômodo */
  fora: Ponto
}

export function paredes(pts: Ponto[]): Parede[] {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length]!
    const d = unit(sub(b, a))
    // sentido horário na tela: o interior fica à direita de quem anda, então "fora" é a esquerda
    return { i, a, b, comprimento: comp(sub(b, a)), d, fora: { x: d.y, y: -d.x } }
  })
}

/** Face externa: cada canto deslocado em esquadria pela espessura. */
export function contornoExterno(pts: Ponto[], espessura: number): Ponto[] {
  const ps = paredes(pts)
  return pts.map((v, i) => {
    const n1 = ps[(i - 1 + ps.length) % ps.length]!.fora
    const n2 = ps[i]!.fora
    const den = 1 + prod(n1, n2)
    // canto quase em "U" (ida e volta): evita esquadria infinita
    if (den < 0.05) return soma(v, mult(n2, espessura))
    return soma(v, mult(soma(n1, n2), espessura / den))
  })
}

/** Garante sentido horário; se precisar inverter, remapeia as aberturas. */
export function orientar(pts: Ponto[], aberturas: Abertura[]): { pontos: Ponto[]; aberturas: Abertura[] } {
  if (areaComSinal(pts) >= 0) return { pontos: pts, aberturas }
  const n = pts.length
  const ps = paredes(pts)
  const pontos = [...pts].reverse()
  return {
    pontos,
    aberturas: aberturas.map((ab) => ({
      ...ab,
      parede: (((n - 2 - ab.parede) % n) + n) % n,
      centro: ps[ab.parede]!.comprimento - ab.centro,
      inverter: ab.tipo === 'porta' ? !ab.inverter : ab.inverter,
    })),
  }
}

export interface GeoAbertura {
  /** face interna, início e fim do vão */
  a: Ponto
  b: Ponto
  /** face externa correspondente */
  aFora: Ponto
  bFora: Ponto
  parede: Parede
  /** distância do início da parede até o início e o fim do vão (já limitada à parede) */
  ini: number
  fim: number
}

export function geoAbertura(comodo: Comodo, ab: Abertura, espessura: number): GeoAbertura | null {
  const p = paredes(comodo.pontos)[ab.parede]
  if (!p) return null
  const largura = Math.min(ab.largura, p.comprimento)
  const ini = Math.min(Math.max(ab.centro - largura / 2, 0), p.comprimento - largura)
  const fim = ini + largura
  const a = soma(p.a, mult(p.d, ini))
  const b = soma(p.a, mult(p.d, fim))
  return { a, b, aFora: soma(a, mult(p.fora, espessura)), bFora: soma(b, mult(p.fora, espessura)), parede: p, ini, fim }
}

/** Retângulo envolvente (com espessura) de um conjunto de cômodos. */
export function limites(comodos: Comodo[], espessura: number) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of comodos) {
    for (const p of contornoExterno(c.pontos, espessura)) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 500, maxY: 400 }
  return { minX, minY, maxX, maxY }
}

/**
 * Muda o comprimento da parede i "esticando" o cômodo: todos os pontos que
 * estão no fim da parede ou além dele (na direção da parede) andam junto.
 * Num retângulo, mudar a parede de cima muda também a de baixo.
 */
export function esticarParede(pts: Ponto[], i: number, novo: number): Ponto[] {
  const p = paredes(pts)[i]
  if (!p || novo <= 1) return pts
  const delta = novo - p.comprimento
  const fim = p.b
  return pts.map((v) => (prod(sub(v, fim), p.d) >= -0.5 ? soma(v, mult(p.d, delta)) : v))
}

export const mover = (pts: Ponto[], d: Ponto) => pts.map((p) => soma(p, d))

/** Formata centímetros como metros no padrão brasileiro: 320 → "3,20". */
export function metros(cm: number): string {
  return (cm / 100).toFixed(2).replace('.', ',')
}
