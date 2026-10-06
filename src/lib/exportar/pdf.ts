import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesenhoPlanta } from '@/componentes/DesenhoPlanta'
import { limites } from '../geometria'
import type { FotoMedida, Projeto } from '../tipos'

const FOLHAS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] } as const
const ESCALAS = [25, 50, 75, 100, 125, 200]
const MARGEM = 12 // mm
const CARIMBO = 22 // altura do carimbo, mm
const FOLGA_COTAS = 80 // cm em volta do desenho para as cotas

export type Folha = keyof typeof FOLHAS

/** Menor escala (mais detalhe) em que a planta cabe na folha. */
export function escolherEscala(projeto: Projeto, folha: Folha): number {
  const b = limites(projeto.comodos, projeto.espessuraParede)
  const larguraCm = b.maxX - b.minX + 2 * FOLGA_COTAS
  const alturaCm = b.maxY - b.minY + 2 * FOLGA_COTAS
  const [fw, fh] = FOLHAS[folha]
  const uteisW = fw - 2 * MARGEM
  const uteisH = fh - 2 * MARGEM - CARIMBO
  for (const e of ESCALAS) {
    if ((larguraCm * 10) / e <= uteisW && (alturaCm * 10) / e <= uteisH) return e
  }
  return Math.ceil(Math.max((larguraCm * 10) / uteisW, (alturaCm * 10) / uteisH) / 25) * 25
}

export interface AnexoPDF {
  foto: FotoMedida
  /** imagem anotada em data URL (JPEG) */
  dataUrl: string
}

export async function gerarPDF(projeto: Projeto, folha: Folha, anexos: AnexoPDF[] = [], escala = escolherEscala(projeto, folha)): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const [fw, fh] = FOLHAS[folha]
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [fw, fh] })
  const areaW = fw - 2 * MARGEM
  const areaH = fh - 2 * MARGEM - CARIMBO
  const data = new Date().toLocaleDateString('pt-BR')

  const carimbo = (subtitulo: string, direita: string) => {
    doc.setDrawColor(28, 25, 23)
    doc.setLineWidth(0.5)
    doc.rect(MARGEM / 2, MARGEM / 2, fw - MARGEM, fh - MARGEM)
    const yc = fh - MARGEM / 2 - CARIMBO
    doc.line(MARGEM / 2, yc, fw - MARGEM / 2, yc)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(projeto.nome, MARGEM, yc + 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(subtitulo, MARGEM, yc + 16)
    doc.text(direita, fw - MARGEM, yc + 9, { align: 'right' })
    doc.text(data, fw - MARGEM, yc + 16, { align: 'right' })
  }

  let primeira = true
  if (projeto.comodos.length > 0) {
    const b = limites(projeto.comodos, projeto.espessuraParede)
    const x0 = b.minX - FOLGA_COTAS
    const y0 = b.minY - FOLGA_COTAS
    const larguraCm = b.maxX - b.minX + 2 * FOLGA_COTAS
    const alturaCm = b.maxY - b.minY + 2 * FOLGA_COTAS
    const marcacao = renderToStaticMarkup(
      createElement(
        'svg',
        { xmlns: 'http://www.w3.org/2000/svg', viewBox: `${x0} ${y0} ${larguraCm} ${alturaCm}`, width: larguraCm, height: alturaCm },
        createElement(DesenhoPlanta, { projeto }),
      ),
    )
    const svg = new DOMParser().parseFromString(marcacao, 'image/svg+xml').documentElement as unknown as SVGSVGElement
    // svg2pdf precisa do elemento no documento para calcular estilos
    const suporte = document.createElement('div')
    suporte.style.cssText = 'position:fixed;left:-99999px;top:0'
    suporte.appendChild(svg)
    document.body.appendChild(suporte)
    try {
      const w = (larguraCm * 10) / escala
      const h = (alturaCm * 10) / escala
      await svg2pdf(svg, doc, { x: MARGEM + (areaW - w) / 2, y: MARGEM + (areaH - h) / 2, width: w, height: h })
    } finally {
      suporte.remove()
    }
    carimbo('Planta baixa - medidas em metros, faces internas das paredes', `Escala 1:${escala}`)
    primeira = false
  }

  // anexos: uma página por foto, com as medidas desenhadas e explicadas na própria imagem
  anexos.forEach(({ foto, dataUrl }, i) => {
    if (!primeira) doc.addPage([fw, fh], 'landscape')
    primeira = false
    const nomeComodo = projeto.comodos.find((c) => c.id === foto.comodoId)?.nome
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`Anexo ${i + 1} - ${foto.titulo}${nomeComodo ? ` (${nomeComodo})` : ''}`, MARGEM, MARGEM + 4)
    const props = doc.getImageProperties(dataUrl)
    const topo = MARGEM + 9
    const maxH = areaH - 9
    const k = Math.min(areaW / props.width, maxH / props.height)
    const w = props.width * k
    const h = props.height * k
    doc.addImage(dataUrl, 'JPEG', MARGEM + (areaW - w) / 2, topo, w, h)
    carimbo('Fotos de levantamento - medidas calculadas a partir da referencia na foto', `Anexo ${i + 1} de ${anexos.length}`)
  })

  return doc.output('blob')
}
