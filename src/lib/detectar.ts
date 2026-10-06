import type { Ponto } from './tipos'

/**
 * Visão computacional simples, no próprio aparelho (sem IA, sem internet):
 * acha a folha de referência (um retângulo claro e liso) e as quinas
 * verticais da parede dos dois lados dela. Serve de ponto de partida; a
 * pessoa confere e ajusta.
 */

const LADO_ANALISE = 900

export interface Imagem {
  /** tons de cinza 0–255 */
  cinza: Uint8ClampedArray
  /** saturação (max - min dos canais): papel branco tem pouca */
  sat: Uint8ClampedArray
  w: number
  h: number
  /** fator para voltar às coordenadas da foto original */
  escala: number
}

export function prepararImagem(img: CanvasImageSource, w: number, h: number): Imagem {
  const k = Math.min(1, LADO_ANALISE / Math.max(w, h))
  const W = Math.max(1, Math.round(w * k))
  const H = Math.max(1, Math.round(h * k))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)
  return imagemDosPixels(data, W, H, 1 / k)
}

/** Separado de prepararImagem para poder testar sem navegador. */
export function imagemDosPixels(rgba: Uint8ClampedArray, W: number, H: number, escala = 1): Imagem {
  const n = W * H
  const cinza = new Uint8ClampedArray(n)
  const sat = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]!
    const g = rgba[i * 4 + 1]!
    const b = rgba[i * 4 + 2]!
    cinza[i] = (r * 299 + g * 587 + b * 114) / 1000
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b)
  }
  return { cinza, sat, w: W, h: H, escala }
}

const areaQuad = (q: Ponto[]) => {
  let s = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!
    const b = q[(i + 1) % 4]!
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}
const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Procura a folha: regiões brancas conectadas, que não encostam na borda,
 * quase retangulares (preenchem bem o quadrilátero dos seus 4 extremos) e com
 * proporção perto da referência (A4 = 1,414). Devolve os cantos na foto original.
 */
export function detectarFolha(im: Imagem, proporcao = 29.7 / 21): Ponto[] | null {
  const { cinza, sat, w, h } = im
  const branco = new Uint8Array(w * h)
  const visto = new Uint8Array(w * h)
  const pilha = new Int32Array(w * h)
  let melhor: { cantos: Ponto[]; nota: number } | null = null
  const areaMin = w * h * 0.0004
  const areaMax = w * h * 0.25

  // o "branco do papel" depende da luz da foto: tenta vários limites e fica com o melhor retângulo
  for (let limiar = 245; limiar >= 135; limiar -= 10) {
    for (let i = 0; i < w * h; i++) branco[i] = cinza[i]! >= limiar && sat[i]! <= 45 ? 1 : 0
    visto.fill(0)
    for (let ini = 0; ini < w * h; ini++) {
      if (!branco[ini] || visto[ini]) continue
      // flood fill (4-vizinhos)
      let topo = 0
      pilha[topo++] = ini
      visto[ini] = 1
      let area = 0
      let borda = false
      // extremos nas diagonais: cantos de um retângulo pouco girado
      let sMax = -Infinity,
        sMin = Infinity,
        dMax = -Infinity,
        dMin = Infinity
      let pSMax = 0,
        pSMin = 0,
        pDMax = 0,
        pDMin = 0
      while (topo > 0) {
        const i = pilha[--topo]!
        area++
        const x = i % w
        const y = (i - x) / w
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) borda = true
        const s = x + y
        const d = x - y
        if (s > sMax) ((sMax = s), (pSMax = i))
        if (s < sMin) ((sMin = s), (pSMin = i))
        if (d > dMax) ((dMax = d), (pDMax = i))
        if (d < dMin) ((dMin = d), (pDMin = i))
        if (x > 0 && branco[i - 1] && !visto[i - 1]) ((visto[i - 1] = 1), (pilha[topo++] = i - 1))
        if (x < w - 1 && branco[i + 1] && !visto[i + 1]) ((visto[i + 1] = 1), (pilha[topo++] = i + 1))
        if (y > 0 && branco[i - w] && !visto[i - w]) ((visto[i - w] = 1), (pilha[topo++] = i - w))
        if (y < h - 1 && branco[i + w] && !visto[i + w]) ((visto[i + w] = 1), (pilha[topo++] = i + w))
      }
      if (borda || area < areaMin || area > areaMax) continue
      const pt = (i: number): Ponto => ({
        x: (i % w) + 0.5,
        y: Math.floor(i / w) + 0.5,
      })
      // ordem: cima-esq (s mín), cima-dir (d máx), baixo-dir (s máx), baixo-esq (d mín)
      const q = [pt(pSMin), pt(pDMax), pt(pSMax), pt(pDMin)]
      const aq = areaQuad(q)
      if (aq < 1) continue
      const preenchimento = area / aq
      if (preenchimento < 0.82 || preenchimento > 1.25) continue
      const l1 = (dist(q[0]!, q[1]!) + dist(q[2]!, q[3]!)) / 2
      const l2 = (dist(q[1]!, q[2]!) + dist(q[3]!, q[0]!)) / 2
      const razao = Math.max(l1, l2) / Math.max(1, Math.min(l1, l2))
      const desvio = Math.abs(razao - proporcao) / proporcao
      if (desvio > 0.35) continue
      const nota = (1 - Math.abs(1 - preenchimento)) * (1 - desvio) * Math.sqrt(area)
      if (!melhor || nota > melhor.nota) melhor = { cantos: q, nota }
    }
  }
  if (!melhor) return null
  // meio pixel para fora: o contorno do branco fica por dentro da borda real do papel
  const c = {
    x: melhor.cantos.reduce((s, p) => s + p.x, 0) / 4,
    y: melhor.cantos.reduce((s, p) => s + p.y, 0) / 4,
  }
  return melhor.cantos.map((p) => {
    const d = dist(p, c) || 1
    return {
      x: (p.x + ((p.x - c.x) / d) * 0.5) * im.escala,
      y: (p.y + ((p.y - c.y) / d) * 0.5) * im.escala,
    }
  })
}

/**
 * Quinas da parede à esquerda e à direita da folha, na altura dela: procura,
 * numa faixa alta, a coluna em que a mudança de tom é mais "contínua" de cima
 * a baixo (uma quina é uma linha vertical longa; móveis e quadros não).
 * Devolve as duas pontas da linha de medida, na foto original.
 */
export function detectarQuinas(im: Imagem, folha: Ponto[]): [Ponto, Ponto] {
  const { cinza, w, h } = im
  const f = folha.map((p) => ({ x: p.x / im.escala, y: p.y / im.escala }))
  const xs = f.map((p) => p.x)
  const ys = f.map((p) => p.y)
  const fx0 = Math.min(...xs)
  const fx1 = Math.max(...xs)
  const altF = Math.max(...ys) - Math.min(...ys)
  const cy = ys.reduce((s, y) => s + y, 0) / 4
  const y0 = Math.max(1, Math.round(cy - altF * 4))
  const y1 = Math.min(h - 2, Math.round(cy + altF * 4))
  const larguraF = fx1 - fx0

  // força de quina por coluna: média do gradiente horizontal com sinal (coerente) na faixa
  const forca = new Float64Array(w)
  for (let x = 1; x < w - 1; x++) {
    let soma = 0
    let somaAbs = 0
    for (let y = y0; y <= y1; y++) {
      const g = cinza[y * w + x + 1]! - cinza[y * w + x - 1]!
      soma += g
      somaAbs += Math.abs(g)
    }
    const n = y1 - y0 + 1
    // coerência: quina tem gradiente do mesmo sinal ao longo da altura
    forca[x] = somaAbs > 0 ? (Math.abs(soma) / n) * (Math.abs(soma) / somaAbs) : 0
  }
  const melhorEntre = (a: number, b: number, padrao: number) => {
    let mx = -1
    let px = padrao
    for (let x = Math.max(1, Math.round(a)); x <= Math.min(w - 2, Math.round(b)); x++) if (forca[x]! > mx) ((mx = forca[x]!), (px = x))
    return mx > 1.5 ? px : padrao
  }
  const esq = melhorEntre(1, fx0 - larguraF, w * 0.05)
  const dir = melhorEntre(fx1 + larguraF, w - 2, w * 0.95)
  return [
    { x: esq * im.escala, y: cy * im.escala },
    { x: dir * im.escala, y: cy * im.escala },
  ]
}

/**
 * Acha a folha e refina os cantos: a primeira busca é na foto reduzida; a
 * segunda, só num recorte em volta da folha, em resolução bem maior (em fotos
 * grandes, a folha ocupa poucos pixels na versão reduzida).
 */
export function acharFolha(img: CanvasImageSource, w: number, h: number, proporcao: number): { folha: Ponto[]; im: Imagem } | null {
  const im = prepararImagem(img, w, h)
  const grossa = detectarFolha(im, proporcao)
  if (!grossa) return null
  const xs = grossa.map((p) => p.x)
  const ys = grossa.map((p) => p.y)
  const lado = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - lado))
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - lado))
  const x1 = Math.min(w, Math.ceil(Math.max(...xs) + lado))
  const y1 = Math.min(h, Math.ceil(Math.max(...ys) + lado))
  const k = Math.min(1, LADO_ANALISE / Math.max(x1 - x0, y1 - y0))
  const W = Math.max(1, Math.round((x1 - x0) * k))
  const H = Math.max(1, Math.round((y1 - y0) * k))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H)
  const fina = detectarFolha(imagemDosPixels(ctx.getImageData(0, 0, W, H).data, W, H, 1 / k), proporcao)
  return { folha: fina ? fina.map((p) => ({ x: p.x + x0, y: p.y + y0 })) : grossa, im }
}
