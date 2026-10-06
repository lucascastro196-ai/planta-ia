import type { Ponto } from './tipos'
import { centroDoTraco, formatarArea, segmentos, type MedidaTraco, type Traco } from './traco'

/** Cores das medidas gravadas, na ordem. */
export const CORES_MEDIDA = ['#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4f46e5']
export const corDaMedida = (i: number) => CORES_MEDIDA[i % CORES_MEDIDA.length]!
export const formatarCm = (cm: number) => `${cm.toFixed(1).replace('.', ',')} cm`

export interface MedidaDesenhada extends Traco, MedidaTraco {
  nome: string
}

/** Texto que explica uma medida (legenda da foto e lista do app). */
export function descreverMedida(m: { cm: number; area?: number; lados?: number[] }): string {
  if (m.area === undefined) return formatarCm(m.cm)
  const lados = m.lados?.length ? `lados ${m.lados.map((l) => l.toFixed(1).replace('.', ',')).join(' · ')} cm  |  ` : ''
  return `${lados}perímetro ${formatarCm(m.cm)}  |  área ${formatarArea(m.area)}`
}

interface Entrada {
  url: string
  w: number
  h: number
  titulo: string
  referencia: string
  /** cantos da referência na foto */
  cantos: Ponto[]
  medidas: MedidaDesenhada[]
}

const LADO_MAXIMO = 2000
const FONTE = 'Helvetica, Arial, sans-serif'

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => erro(new Error('Não consegui abrir a foto.'))
    img.src = url
  })
}

/** Quebra o texto em linhas que caibam na largura. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const saida: string[] = []
  let atual = ''
  for (const p of texto.split(' ')) {
    const teste = atual ? `${atual} ${p}` : p
    if (ctx.measureText(teste).width > largura && atual) {
      saida.push(atual)
      atual = p
    } else atual = teste
  }
  if (atual) saida.push(atual)
  return saida
}

/**
 * Gera a foto anotada: cada medida (linha ou forma) numerada, com o valor de
 * cada lado, a referência marcada e, embaixo, uma legenda explicando tudo.
 */
export async function gerarFotoAnotada(e: Entrada): Promise<Blob> {
  const img = await carregar(e.url)
  const k = Math.min(1, LADO_MAXIMO / Math.max(e.w, e.h))
  const W = Math.round(e.w * k)
  const Hf = Math.round(e.h * k)
  const u = W / 100 // 1% da largura
  const fonte = Math.max(14, u * 2.1)
  const P = (p: Ponto): Ponto => ({ x: p.x * k, y: p.y * k })

  // legenda: mede antes para saber a altura do quadro
  const medir = document.createElement('canvas').getContext('2d')!
  medir.font = `${fonte}px ${FONTE}`
  const larguraTexto = W - 4 * u - fonte * 2
  const blocos = e.medidas.map((m) => quebrar(medir, `${m.nome}: ${descreverMedida({ cm: m.total, area: m.area, lados: m.fechada ? m.lados : undefined })}`, larguraTexto))
  medir.font = `${fonte * 0.8}px ${FONTE}`
  const rodape = quebrar(medir, `Medidas calculadas na foto a partir da referência (${e.referencia}). Valem para pontos no mesmo plano da referência.`, W - 4 * u)
  const alturaLegenda = 3 * u + fonte * 1.6 + blocos.reduce((s, b) => s + fonte * 0.5 + b.length * fonte * 1.3, 0) + fonte * 0.8 + rodape.length * fonte * 1.1 + 2 * u

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = Math.round(Hf + alturaLegenda)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, W, Hf)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const caminho = (pts: Ponto[], fechar: boolean) => {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    if (fechar) ctx.closePath()
  }

  // referência
  caminho(e.cantos.map(P), true)
  ctx.fillStyle = 'rgba(59,130,246,0.25)'
  ctx.fill()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = Math.max(2, u * 0.25)
  ctx.stroke()

  const selo = (c: Ponto, n: number, cor: string, r = fonte * 0.75) => {
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fillStyle = cor
    ctx.fill()
    ctx.lineWidth = Math.max(2, u * 0.2)
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${r * 1.2}px ${FONTE}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), c.x, c.y + 1)
  }

  /** etiqueta com fundo branco, centrada em c */
  const etiqueta = (c: Ponto, texto: string, cor: string, tam: number) => {
    ctx.font = `bold ${tam}px ${FONTE}`
    const larg = ctx.measureText(texto).width + tam * 0.9
    const alt = tam * 1.45
    const x0 = Math.min(Math.max(c.x - larg / 2, 2), W - larg - 2)
    const y0 = Math.min(Math.max(c.y - alt / 2, 2), Hf - alt - 2)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.strokeStyle = cor
    ctx.lineWidth = Math.max(1.5, u * 0.15)
    ctx.beginPath()
    ctx.roundRect(x0, y0, larg, alt, alt / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#1c1917'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(texto, x0 + larg / 2, y0 + alt / 2 + 1)
  }

  e.medidas.forEach((m, i) => {
    const cor = corDaMedida(i)
    const pts = m.pts.map(P)
    if (m.fechada) {
      caminho(pts, true)
      ctx.globalAlpha = 0.18
      ctx.fillStyle = cor
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // contorno branco por baixo para a linha aparecer em qualquer fundo
    for (const [estilo, larg] of [
      ['#ffffff', u * 0.8],
      [cor, u * 0.45],
    ] as const) {
      caminho(pts, m.fechada)
      ctx.strokeStyle = estilo
      ctx.lineWidth = Math.max(3, larg)
      ctx.stroke()
    }
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, u * 0.55, 0, Math.PI * 2)
      ctx.fillStyle = cor
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(2, u * 0.18)
      ctx.stroke()
    }
    const segs = segmentos(m)
    if (m.fechada || segs.length > 1) {
      // um valor por lado
      segs.forEach(([a, b], s) => {
        const meio = { x: (pts[a]!.x + pts[b]!.x) / 2, y: (pts[a]!.y + pts[b]!.y) / 2 }
        etiqueta(meio, (m.lados[s] ?? 0).toFixed(1).replace('.', ','), cor, fonte * 0.75)
      })
    }
    // número (e total) no centro da forma ou no meio da linha
    const centro = m.fechada ? P(centroDoTraco(m)) : { x: (pts[0]!.x + pts[pts.length - 1]!.x) / 2, y: (pts[0]!.y + pts[pts.length - 1]!.y) / 2 - fonte * 1.4 }
    const resumo = m.fechada && m.area !== undefined ? formatarArea(m.area) : formatarCm(m.total)
    ctx.font = `bold ${fonte}px ${FONTE}`
    const larg = ctx.measureText(resumo).width + fonte * 2.6
    const alt = fonte * 1.5
    const x0 = Math.min(Math.max(centro.x - larg / 2, 2), W - larg - 2)
    const y0 = Math.min(Math.max(centro.y - alt / 2, 2), Hf - alt - 2)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.strokeStyle = cor
    ctx.lineWidth = Math.max(2, u * 0.2)
    ctx.beginPath()
    ctx.roundRect(x0, y0, larg, alt, alt / 2)
    ctx.fill()
    ctx.stroke()
    selo({ x: x0 + alt / 2, y: y0 + alt / 2 }, i + 1, cor)
    ctx.fillStyle = '#1c1917'
    ctx.font = `bold ${fonte}px ${FONTE}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(resumo, x0 + alt + fonte * 0.3, y0 + alt / 2 + 1)
  })

  // legenda
  let y = Hf + 3 * u
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1c1917'
  ctx.font = `bold ${fonte * 1.15}px ${FONTE}`
  ctx.fillText(e.titulo, 2 * u, y + fonte)
  y += fonte * 1.6
  blocos.forEach((linhas, i) => {
    y += fonte * 0.5
    selo({ x: 2 * u + fonte * 0.7, y: y + fonte * 0.9 }, i + 1, corDaMedida(i), fonte * 0.65)
    ctx.fillStyle = '#1c1917'
    ctx.font = `${fonte}px ${FONTE}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    for (const l of linhas) {
      y += fonte * 1.3
      ctx.fillText(l, 2 * u + fonte * 2, y)
    }
  })
  y += fonte * 0.8
  ctx.fillStyle = '#57534e'
  ctx.font = `${fonte * 0.8}px ${FONTE}`
  for (const l of rodape) {
    y += fonte * 1.1
    ctx.fillText(l, 2 * u, y)
  }

  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.88))
}
