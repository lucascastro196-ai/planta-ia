import type { Ponto } from './tipos'

/** Cores das medidas gravadas, na ordem (a 1ª é a mesma laranja da medida em edição). */
export const CORES_MEDIDA = ['#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4f46e5']
export const corDaMedida = (i: number) => CORES_MEDIDA[i % CORES_MEDIDA.length]!

export interface MedidaDesenhada {
  nome: string
  a: Ponto
  b: Ponto
  cm: number
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
export const formatarCm = (cm: number) => `${cm.toFixed(1).replace('.', ',')} cm`

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => erro(new Error('Não consegui abrir a foto.'))
    img.src = url
  })
}

/** Quebra o texto em linhas que caibam na largura. */
function linhas(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const palavras = texto.split(' ')
  const saida: string[] = []
  let atual = ''
  for (const p of palavras) {
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
 * Gera a foto anotada: linhas numeradas com o valor de cada medida, o
 * contorno da referência e, embaixo, uma legenda explicando cada medida.
 */
export async function gerarFotoAnotada(e: Entrada): Promise<Blob> {
  const img = await carregar(e.url)
  const k = Math.min(1, LADO_MAXIMO / Math.max(e.w, e.h))
  const W = Math.round(e.w * k)
  const Hf = Math.round(e.h * k)
  const u = W / 100 // unidade de desenho: 1% da largura
  const fonte = Math.max(14, u * 2.2)
  const P = (p: Ponto): Ponto => ({ x: p.x * k, y: p.y * k })

  // legenda: mede antes para saber a altura do quadro
  const medir = document.createElement('canvas').getContext('2d')!
  medir.font = `${fonte}px Helvetica, Arial, sans-serif`
  const textoRodape = `Medidas calculadas na foto a partir da referência (${e.referencia}). Valem para pontos no mesmo plano da referência.`
  const rodape = linhas(medir, textoRodape, W - 4 * u)
  const alturaLegenda = 3 * u + fonte * 1.6 + e.medidas.length * fonte * 1.7 + rodape.length * fonte * 1.3 + 2 * u

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = Math.round(Hf + alturaLegenda)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, W, Hf)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // referência
  const c = e.cantos.map(P)
  ctx.beginPath()
  c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fillStyle = 'rgba(59,130,246,0.25)'
  ctx.fill()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = Math.max(2, u * 0.25)
  ctx.stroke()

  const selo = (centro: Ponto, n: number, cor: string) => {
    const r = fonte * 0.75
    ctx.beginPath()
    ctx.arc(centro.x, centro.y, r, 0, Math.PI * 2)
    ctx.fillStyle = cor
    ctx.fill()
    ctx.lineWidth = Math.max(2, u * 0.2)
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fonte * 0.9}px Helvetica, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), centro.x, centro.y + 1)
  }

  e.medidas.forEach((m, i) => {
    const cor = corDaMedida(i)
    const a = P(m.a)
    const b = P(m.b)
    // contorno branco por baixo para a linha aparecer em qualquer fundo
    for (const [estilo, larg] of [
      ['#ffffff', u * 0.9],
      [cor, u * 0.5],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = estilo
      ctx.lineWidth = Math.max(3, larg)
      ctx.stroke()
    }
    for (const p of [a, b]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, u * 0.7, 0, Math.PI * 2)
      ctx.fillStyle = cor
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(2, u * 0.2)
      ctx.stroke()
    }
    // etiqueta no meio: número + valor
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const valor = formatarCm(m.cm)
    ctx.font = `bold ${fonte}px Helvetica, Arial, sans-serif`
    const tw = ctx.measureText(valor).width
    const alt = fonte * 1.5
    const larg = tw + fonte * 2.6
    const x0 = Math.min(Math.max(meio.x - larg / 2, 2), W - larg - 2)
    const y0 = Math.min(Math.max(meio.y - alt - u, 2), Hf - alt - 2)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.strokeStyle = cor
    ctx.lineWidth = Math.max(2, u * 0.2)
    ctx.beginPath()
    ctx.roundRect(x0, y0, larg, alt, alt / 2)
    ctx.fill()
    ctx.stroke()
    selo({ x: x0 + alt / 2, y: y0 + alt / 2 }, i + 1, cor)
    ctx.fillStyle = '#1c1917'
    ctx.font = `bold ${fonte}px Helvetica, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(valor, x0 + alt + fonte * 0.3, y0 + alt / 2 + 1)
  })

  // legenda
  let y = Hf + 3 * u
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1c1917'
  ctx.font = `bold ${fonte * 1.15}px Helvetica, Arial, sans-serif`
  ctx.fillText(e.titulo, 2 * u, y + fonte)
  y += fonte * 1.6
  e.medidas.forEach((m, i) => {
    y += fonte * 1.7
    selo({ x: 2 * u + fonte * 0.75, y: y - fonte * 0.35 }, i + 1, corDaMedida(i))
    ctx.fillStyle = '#1c1917'
    ctx.font = `${fonte}px Helvetica, Arial, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`${m.nome}: `, 2 * u + fonte * 2, y)
    const x = 2 * u + fonte * 2 + ctx.measureText(`${m.nome}: `).width
    ctx.font = `bold ${fonte}px Helvetica, Arial, sans-serif`
    ctx.fillText(formatarCm(m.cm), x, y)
  })
  y += fonte * 0.6
  ctx.fillStyle = '#57534e'
  ctx.font = `${fonte * 0.8}px Helvetica, Arial, sans-serif`
  for (const l of rodape) {
    y += fonte * 1.3
    ctx.fillText(l, 2 * u, y)
  }

  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.88))
}
