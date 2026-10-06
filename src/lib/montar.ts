import { orientar } from './geometria'
import { novoId, type Comodo, type Ponto } from './tipos'

const RAD = Math.PI / 180

export interface ParedeMedida {
  /** comprimento da face interna, em cm */
  comprimento: number
  /** giro no fim da parede, andando no sentido horário visto de cima: 90 = vira à direita, -90 = à esquerda */
  giro: number
}

/** Ângulos perto de ±90 viram ±90 exatos (paredes em esquadro são a regra). */
function arredondarGiro(g: number): number {
  for (const alvo of [90, -90, 0, 180, -180]) if (Math.abs(g - alvo) <= 12) return alvo
  return g
}

function vetores(lista: ParedeMedida[]): Ponto[] {
  const vs: Ponto[] = []
  let ang = 0
  for (const p of lista) {
    const c = Math.max(1, p.comprimento)
    const v = { x: Math.cos(ang * RAD) * c, y: Math.sin(ang * RAD) * c }
    if (Math.abs(v.x) < 1e-9) v.x = 0
    if (Math.abs(v.y) < 1e-9) v.y = 0
    vs.push(v)
    ang += arredondarGiro(p.giro)
  }
  return vs
}

/** Quanto falta (em cm) para a última parede chegar no início da primeira. */
export function erroDeFechamento(lista: ParedeMedida[]): number {
  const e = vetores(lista).reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 })
  return Math.hypot(e.x, e.y)
}

/**
 * Transforma a sequência de paredes medidas em polígono fechado. Medidas
 * reais nunca fecham perfeito: o erro é repartido entre as paredes. Se todas
 * estão em esquadro, o erro em x vai só para as horizontais e o erro em y só
 * para as verticais, então os cantos continuam a 90°.
 */
export function poligonoDasParedes(lista: ParedeMedida[]): Ponto[] {
  const vs = vetores(lista)
  const erro = vs.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 })
  const esquadro = vs.every((v) => v.x === 0 || v.y === 0)

  if (esquadro) {
    const somaH = vs.reduce((s, v) => s + Math.abs(v.x), 0)
    const somaV = vs.reduce((s, v) => s + Math.abs(v.y), 0)
    for (const v of vs) {
      if (somaH > 0 && v.x !== 0) v.x -= (erro.x * Math.abs(v.x)) / somaH
      if (somaV > 0 && v.y !== 0) v.y -= (erro.y * Math.abs(v.y)) / somaV
    }
  } else {
    // fechamento proporcional ao comprimento (método de Bowditch)
    const total = vs.reduce((s, v) => s + Math.hypot(v.x, v.y), 0)
    for (const v of vs) {
      const f = Math.hypot(v.x, v.y) / total
      v.x -= erro.x * f
      v.y -= erro.y * f
    }
  }

  const pontos: Ponto[] = []
  let p = { x: 0, y: 0 }
  for (const v of vs) {
    pontos.push(p)
    p = { x: p.x + v.x, y: p.y + v.y }
  }
  return pontos.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }))
}

/** Põe o polígono em sentido horário e o canto de cima à esquerda na posição pedida. */
function posicionar(nome: string, pts: Ponto[], peDireito: number, posicao: Ponto): Comodo {
  const { pontos } = orientar(pts, [])
  const minX = Math.min(...pontos.map((p) => p.x))
  const minY = Math.min(...pontos.map((p) => p.y))
  return {
    id: novoId(),
    nome: nome.trim() || 'Cômodo',
    pontos: pontos.map((p) => ({ x: Math.round((p.x - minX + posicao.x) * 10) / 10, y: Math.round((p.y - minY + posicao.y) * 10) / 10 })),
    peDireito: peDireito > 150 ? peDireito : 270,
    aberturas: [],
  }
}

/** Cômodo a partir das paredes medidas uma a uma. */
export function comodoDasParedes(nome: string, lista: ParedeMedida[], peDireito: number, posicao: Ponto): Comodo {
  if (lista.length < 3) throw new Error('Informe pelo menos 3 paredes.')
  return posicionar(nome, poligonoDasParedes(lista), peDireito, posicao)
}

/** Cômodo a partir dos cantos do piso marcados com a câmera (cm, vista de cima). */
export function comodoDoContorno(nome: string, pontosCm: Ponto[], posicao: Ponto): Comodo {
  if (pontosCm.length < 3) throw new Error('Marque pelo menos 3 cantos.')
  return posicionar(nome, pontosCm, 270, posicao)
}

/** Cômodo retangular (largura × profundidade). */
export function comodoRetangular(nome: string, largura: number, profundidade: number, posicao: Ponto): Comodo {
  return comodoDasParedes(
    nome,
    [
      { comprimento: largura, giro: 90 },
      { comprimento: profundidade, giro: 90 },
      { comprimento: largura, giro: 90 },
      { comprimento: profundidade, giro: 90 },
    ],
    270,
    posicao,
  )
}
