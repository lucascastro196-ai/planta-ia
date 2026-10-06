import { orientar, paredes } from './geometria'
import type { LeituraComodo } from './leitura'
import { novoId, type Abertura, type Comodo, type Ponto } from './tipos'

const RAD = Math.PI / 180

/** Ângulos perto de ±90 viram ±90 exatos (paredes em esquadro são a regra). */
function arredondarGiro(g: number): number {
  for (const alvo of [90, -90, 0, 180, -180]) if (Math.abs(g - alvo) <= 12) return alvo
  return g
}

/**
 * Transforma a leitura da IA (sequência de paredes com giros) em polígono
 * fechado. As fotos nunca fecham perfeito: o erro de fechamento é repartido
 * entre as paredes. Se todas estão em esquadro, o erro em x vai só para as
 * horizontais e o erro em y só para as verticais, então os cantos continuam a 90°.
 */
export function poligonoDasParedes(lista: { comprimento: number; giro: number }[]): Ponto[] {
  const giros = lista.map((p) => arredondarGiro(p.giro))
  const vetores: Ponto[] = []
  let ang = 0
  for (let i = 0; i < lista.length; i++) {
    const c = Math.max(1, lista[i]!.comprimento)
    vetores.push({ x: Math.cos(ang * RAD) * c, y: Math.sin(ang * RAD) * c })
    ang += giros[i]!
  }
  for (const v of vetores) {
    if (Math.abs(v.x) < 1e-9) v.x = 0
    if (Math.abs(v.y) < 1e-9) v.y = 0
  }

  const erro = vetores.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 })
  const esquadro = vetores.every((v) => v.x === 0 || v.y === 0)

  if (esquadro) {
    const somaH = vetores.reduce((s, v) => s + Math.abs(v.x), 0)
    const somaV = vetores.reduce((s, v) => s + Math.abs(v.y), 0)
    for (const v of vetores) {
      if (somaH > 0 && v.x !== 0) v.x -= (erro.x * Math.abs(v.x)) / somaH
      if (somaV > 0 && v.y !== 0) v.y -= (erro.y * Math.abs(v.y)) / somaV
    }
  } else {
    // fechamento proporcional ao comprimento (método de Bowditch)
    const total = vetores.reduce((s, v) => s + Math.hypot(v.x, v.y), 0)
    for (const v of vetores) {
      const f = Math.hypot(v.x, v.y) / total
      v.x -= erro.x * f
      v.y -= erro.y * f
    }
  }

  const pontos: Ponto[] = []
  let p = { x: 0, y: 0 }
  for (const v of vetores) {
    pontos.push(p)
    p = { x: p.x + v.x, y: p.y + v.y }
  }
  return pontos.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }))
}

export function comodoDaLeitura(l: LeituraComodo, posicao: Ponto): Comodo {
  if (l.paredes.length < 3) throw new Error('A IA não conseguiu identificar paredes suficientes. Tente fotos mais abertas, mostrando os cantos.')
  const base = poligonoDasParedes(l.paredes.map((p) => ({ comprimento: p.comprimento_cm, giro: p.giro_graus })))
  const ps = paredes(base)

  const aberturas: Abertura[] = []
  for (const a of l.aberturas) {
    const parede = ps[Math.round(a.parede)]
    if (!parede) continue
    const largura = Math.min(Math.max(a.largura_cm, 30), parede.comprimento)
    aberturas.push({
      id: novoId(),
      tipo: a.tipo,
      parede: parede.i,
      centro: Math.max(0, a.distancia_inicio_cm) + largura / 2,
      largura,
      altura: a.altura_cm > 0 ? a.altura_cm : a.tipo === 'porta' ? 210 : 120,
      peitoril: a.tipo === 'porta' ? 0 : Math.max(0, a.peitoril_cm),
    })
  }

  const orientado = orientar(base, aberturas)
  // canto de cima à esquerda vai para a posição pedida
  const minX = Math.min(...orientado.pontos.map((p) => p.x))
  const minY = Math.min(...orientado.pontos.map((p) => p.y))
  return {
    id: novoId(),
    nome: l.nome.trim() || 'Cômodo',
    pontos: orientado.pontos.map((p) => ({ x: p.x - minX + posicao.x, y: p.y - minY + posicao.y })),
    peDireito: l.pe_direito_cm > 150 ? l.pe_direito_cm : 270,
    aberturas: orientado.aberturas,
    observacoes: l.observacoes,
    confianca: l.confianca,
  }
}

/** Cômodo retangular para desenhar à mão (ou quando não há fotos). */
export function comodoRetangular(nome: string, largura: number, profundidade: number, posicao: Ponto): Comodo {
  const { x, y } = posicao
  return {
    id: novoId(),
    nome,
    pontos: [
      { x, y },
      { x: x + largura, y },
      { x: x + largura, y: y + profundidade },
      { x, y: y + profundidade },
    ],
    peDireito: 270,
    aberturas: [],
  }
}

/** Cômodo a partir dos cantos do piso marcados com a câmera (cm, vista de cima). */
export function comodoDoContorno(nome: string, pontosCm: Ponto[], posicao: Ponto): Comodo {
  if (pontosCm.length < 3) throw new Error('Marque pelo menos 3 cantos.')
  const { pontos } = orientar(pontosCm, [])
  const minX = Math.min(...pontos.map((p) => p.x))
  const minY = Math.min(...pontos.map((p) => p.y))
  return {
    id: novoId(),
    nome,
    pontos: pontos.map((p) => ({ x: Math.round(p.x - minX + posicao.x), y: Math.round(p.y - minY + posicao.y) })),
    peDireito: 270,
    aberturas: [],
  }
}
