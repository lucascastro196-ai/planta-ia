import type { Ponto } from './tipos'

/**
 * Medição na foto: com os 4 cantos de um objeto de tamanho conhecido
 * (folha A4, cartão) encostado numa parede, a homografia leva qualquer ponto
 * da foto para centímetros reais naquele plano.
 */

/** Resolve A·x = b por eliminação de Gauss com pivotamento parcial. */
function resolver(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((linha, i) => [...linha, b[i]!])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let l = c + 1; l < n; l++) if (Math.abs(M[l]![c]!) > Math.abs(M[piv]![c]!)) piv = l
    if (Math.abs(M[piv]![c]!) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv]!, M[c]!]
    for (let l = 0; l < n; l++) {
      if (l === c) continue
      const f = M[l]![c]! / M[c]![c]!
      for (let k = c; k <= n; k++) M[l]![k]! -= f * M[c]![k]!
    }
  }
  return M.map((linha, i) => linha[n]! / linha[i]!)
}

export type Homografia = (p: Ponto) => Ponto

/** Homografia que leva os 4 pontos `de` para os 4 pontos `para`. */
export function homografia(de: Ponto[], para: Ponto[]): Homografia | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = de[i]!
    const { x: u, y: v } = para[i]!
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = resolver(A, b)
  if (!h) return null
  const [a, bb, c, d, e, f, g, k] = h as [number, number, number, number, number, number, number, number]
  return ({ x, y }) => {
    const w = g * x + k * y + 1
    return { x: (a * x + bb * y + c) / w, y: (d * x + e * y + f) / w }
  }
}

/**
 * Coloca os 4 cantos marcados em ordem (horária, começando no de cima à
 * esquerda) e decide qual lado da referência é o comprido pelo que aparece
 * maior na foto. Assim a pessoa pode arrastar os cantos em qualquer ordem.
 */
export function homografiaDaReferencia(cantos: Ponto[], larguraCm: number, alturaCm: number): Homografia | null {
  if (cantos.length !== 4) return null
  const c = { x: cantos.reduce((s, p) => s + p.x, 0) / 4, y: cantos.reduce((s, p) => s + p.y, 0) / 4 }
  const ordem = [...cantos].sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x))
  const ini = ordem.reduce((m, p, i) => (p.x + p.y < ordem[m]!.x + ordem[m]!.y ? i : m), 0)
  const p = [0, 1, 2, 3].map((i) => ordem[(ini + i) % 4]!)
  const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)
  const horizontal = dist(p[0]!, p[1]!) + dist(p[2]!, p[3]!)
  const vertical = dist(p[1]!, p[2]!) + dist(p[3]!, p[0]!)
  const maior = Math.max(larguraCm, alturaCm)
  const menor = Math.min(larguraCm, alturaCm)
  const [w, h] = horizontal >= vertical ? [maior, menor] : [menor, maior]
  return homografia(p, [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ])
}

export const REFERENCIAS = {
  a4: { nome: 'Folha A4', largura: 21, altura: 29.7 },
  carta: { nome: 'Folha Carta', largura: 21.59, altura: 27.94 },
  cartao: { nome: 'Cartão de crédito', largura: 8.56, altura: 5.398 },
  azulejo: { nome: 'Peça de piso/azulejo (informar)', largura: 60, altura: 60 },
} as const

export type Referencia = keyof typeof REFERENCIAS
