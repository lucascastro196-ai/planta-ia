import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesenhoPlanta } from '@/componentes/DesenhoPlanta'
import { limites } from '../geometria'
import type { Projeto } from '../tipos'

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

export async function gerarPDF(projeto: Projeto, folha: Folha, escala = escolherEscala(projeto, folha)): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
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

  const [fw, fh] = FOLHAS[folha]
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [fw, fh] })
  try {
    const w = (larguraCm * 10) / escala
    const h = (alturaCm * 10) / escala
    const areaW = fw - 2 * MARGEM
    const areaH = fh - 2 * MARGEM - CARIMBO
    await svg2pdf(svg, doc, { x: MARGEM + (areaW - w) / 2, y: MARGEM + (areaH - h) / 2, width: w, height: h })
  } finally {
    suporte.remove()
  }

  // moldura e carimbo
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
  doc.text('Planta baixa — medidas em metros, faces internas das paredes', MARGEM, yc + 16)
  doc.text(`Escala 1:${escala}`, fw - MARGEM, yc + 9, { align: 'right' })
  doc.text(new Date().toLocaleDateString('pt-BR'), fw - MARGEM, yc + 16, { align: 'right' })
  return doc.output('blob')
}
