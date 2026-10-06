import { describe, expect, test } from 'bun:test'
import { areaComSinal, contornoExterno, esticarParede, geoAbertura, orientar, paredes } from '../src/lib/geometria'
import { comodoDaLeitura, comodoRetangular, poligonoDasParedes } from '../src/lib/montar'
import { gerarDXF } from '../src/lib/exportar/dxf'
import { gerarDAE } from '../src/lib/exportar/dae'
import type { LeituraComodo } from '../src/lib/leitura'
import type { Projeto } from '../src/lib/tipos'

const comprimentos = (pts: { x: number; y: number }[]) => paredes(pts).map((p) => Math.round(p.comprimento * 10) / 10)

describe('fechamento das paredes', () => {
  test('retângulo exato fecha sem ajuste', () => {
    const pts = poligonoDasParedes([
      { comprimento: 400, giro: 90 },
      { comprimento: 300, giro: 90 },
      { comprimento: 400, giro: 90 },
      { comprimento: 300, giro: 90 },
    ])
    expect(comprimentos(pts)).toEqual([400, 300, 400, 300])
    expect(areaComSinal(pts)).toBeGreaterThan(0)
  })

  test('erro de leitura é repartido e os cantos ficam em esquadro', () => {
    const pts = poligonoDasParedes([
      { comprimento: 400, giro: 88 },
      { comprimento: 310, giro: 91 },
      { comprimento: 390, giro: 90 },
      { comprimento: 300, giro: 92 },
    ])
    const [a, b, c, d] = comprimentos(pts)
    expect(a).toBeCloseTo(c!, 0)
    expect(b).toBeCloseTo(d!, 0)
    expect(a).toBeCloseTo(395, 0)
    for (const p of paredes(pts)) expect(Math.abs(p.d.x) < 1e-9 || Math.abs(p.d.y) < 1e-9).toBe(true)
  })

  test('cômodo em L com canto reentrante', () => {
    const pts = poligonoDasParedes([
      { comprimento: 500, giro: 90 },
      { comprimento: 200, giro: 90 },
      { comprimento: 200, giro: -90 },
      { comprimento: 200, giro: 90 },
      { comprimento: 300, giro: 90 },
      { comprimento: 400, giro: 90 },
    ])
    expect(comprimentos(pts)).toEqual([500, 200, 200, 200, 300, 400])
    expect(areaComSinal(pts) / 10000).toBeCloseTo(5 * 4 - 2 * 2, 5)
  })
})

describe('geometria', () => {
  test('contorno externo de um retângulo cresce a espessura para fora', () => {
    const c = comodoRetangular('Sala', 400, 300, { x: 0, y: 0 })
    expect(contornoExterno(c.pontos, 15)).toEqual([
      { x: -15, y: -15 },
      { x: 415, y: -15 },
      { x: 415, y: 315 },
      { x: -15, y: 315 },
    ])
  })

  test('esticar a parede de cima leva a de baixo junto', () => {
    const c = comodoRetangular('Sala', 400, 300, { x: 0, y: 0 })
    expect(comprimentos(esticarParede(c.pontos, 0, 450))).toEqual([450, 300, 450, 300])
    expect(comprimentos(esticarParede(c.pontos, 1, 280))).toEqual([400, 280, 400, 280])
  })

  test('inverter o sentido mantém a porta no mesmo lugar', () => {
    const anti = [
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 0 },
    ]
    // parede 1 vai de (0,300) a (400,300); porta a 100 cm do início
    const porta = { id: 'p', tipo: 'porta' as const, parede: 1, centro: 100, largura: 80, altura: 210, peitoril: 0 }
    const r = orientar(anti, [porta])
    expect(areaComSinal(r.pontos)).toBeGreaterThan(0)
    const g = geoAbertura({ id: 'c', nome: '', pontos: r.pontos, peDireito: 270, aberturas: r.aberturas }, r.aberturas[0]!, 15)!
    const xs = [g.a.x, g.b.x].sort((a, b) => a - b)
    expect(xs).toEqual([60, 140])
    expect(g.a.y).toBe(300)
  })
})

const leitura: LeituraComodo = {
  nome: 'Quarto',
  paredes: [
    { descricao: 'janela', comprimento_cm: 320, giro_graus: 90 },
    { descricao: 'armário', comprimento_cm: 280, giro_graus: 90 },
    { descricao: 'porta', comprimento_cm: 320, giro_graus: 90 },
    { descricao: 'cama', comprimento_cm: 280, giro_graus: 90 },
  ],
  pe_direito_cm: 265,
  aberturas: [
    { tipo: 'janela', parede: 0, distancia_inicio_cm: 100, largura_cm: 120, altura_cm: 100, peitoril_cm: 110 },
    { tipo: 'porta', parede: 2, distancia_inicio_cm: 30, largura_cm: 80, altura_cm: 210, peitoril_cm: 0 },
  ],
  confianca: 'media',
  observacoes: ['parede 4 estimada'],
}

describe('leitura da IA → cômodo', () => {
  test('monta polígono, aberturas e posição', () => {
    const c = comodoDaLeitura(leitura, { x: 1000, y: 50 })
    expect(comprimentos(c.pontos)).toEqual([320, 280, 320, 280])
    expect(Math.min(...c.pontos.map((p) => p.x))).toBe(1000)
    expect(c.peDireito).toBe(265)
    expect(c.aberturas.map((a) => [a.tipo, a.parede, a.centro])).toEqual([
      ['janela', 0, 160],
      ['porta', 2, 70],
    ])
  })

  test('recusa leitura com menos de 3 paredes', () => {
    expect(() => comodoDaLeitura({ ...leitura, paredes: leitura.paredes.slice(0, 2) }, { x: 0, y: 0 })).toThrow()
  })
})

describe('exportação', () => {
  const projeto: Projeto = { versao: 1, nome: 'Casa <teste>', espessuraParede: 15, comodos: [comodoDaLeitura(leitura, { x: 0, y: 0 })] }

  test('DXF R12 bem formado', () => {
    const dxf = gerarDXF(projeto)
    const linhas = dxf.trimEnd().split('\r\n')
    expect(linhas.length % 2).toBe(0)
    expect(linhas.slice(-2)).toEqual(['0', 'EOF'])
    expect(dxf).toContain('AC1009')
    expect(dxf.match(/\r\nARC\r\n/g)?.length).toBe(1)
    expect(dxf).toContain('\r\n3,20\r\n')
  })

  test('DAE com paredes recortadas e piso', () => {
    const dae = gerarDAE(projeto)
    expect(dae).toContain('<up_axis>Z_UP</up_axis>')
    expect(dae).toContain('Casa &#60;teste&#62;')
    const tri = [...dae.matchAll(/<triangles material="(\w+)" count="(\d+)"/g)].map((m) => [m[1], Number(m[2])])
    // 4 paredes inteiras = 4 prismas; cada vão cria +2 pedaços laterais e 2 (peitoril/verga) ou 1 (porta)
    // prismas = 12 triângulos; parede 0: 2 laterais + peitoril + verga; parede 2: 2 laterais + verga
    expect(tri[0]).toEqual(['parede', (2 + 4 + 3) * 12])
    expect(tri[1]).toEqual(['piso', 2])
  })
})
