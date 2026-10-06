import { describe, expect, test } from 'bun:test'
import { homografia } from '../src/lib/homografia'
import { aplicarComprimento, medirTraco, remapearTravas, restringirPonto, segmentos, transladarLado, type Traco } from '../src/lib/traco'

// foto em que 1 px = 0,5 cm (homografia de escala pura)
const H = homografia(
  [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
    { x: 0, y: 50 },
  ],
)!

describe('linhas e formas medidas na foto', () => {
  test('linha com ponto no meio soma os trechos', () => {
    const m = medirTraco(H, { fechada: false, pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }] })!
    expect(m.lados).toEqual([100, 50])
    expect(m.total).toBe(150)
    expect(m.area).toBeUndefined()
  })

  test('quadrado com um "dente" tem lados, perímetro e área certos', () => {
    // 200×200 cm com um recorte de 50×50 cm no meio do lado de cima
    const pts = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 800 },
      { x: 0, y: 800 },
    ]
    const m = medirTraco(H, { fechada: true, pts })!
    expect(segmentos({ fechada: true, pts })).toHaveLength(8)
    expect(m.lados).toEqual([150, 50, 100, 50, 150, 400, 400, 400])
    expect(m.total).toBe(1700)
    expect(m.area).toBeCloseTo(16 - 0.5, 6)
  })

  test('lado travado: digitar a medida, girar pela ponta e mover pelo meio mantêm o comprimento', () => {
    // foto em perspectiva, para a trava valer em cm reais e não em pixels
    const Hp = homografia(
      [
        { x: 100, y: 100 },
        { x: 900, y: 140 },
        { x: 880, y: 700 },
        { x: 120, y: 760 },
      ],
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
    )!
    const Hi = homografia(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
      [
        { x: 100, y: 100 },
        { x: 900, y: 140 },
        { x: 880, y: 700 },
        { x: 120, y: 760 },
      ],
    )!
    let t: Traco = { fechada: false, pts: [Hi({ x: 50, y: 0 }), Hi({ x: 50, y: 200 })] }
    t = { ...t, travados: { 0: 300 }, pts: aplicarComprimento(t, 0, 300, Hp, Hi) }
    expect(medirTraco(Hp, t)!.total).toBeCloseTo(300, 1)

    // arrastar a ponta final para qualquer lugar: continua com 300
    const q = restringirPonto(t, 1, { x: 700, y: 500 }, Hp, Hi)
    t = { ...t, pts: [t.pts[0]!, q] }
    expect(medirTraco(Hp, t)!.total).toBeCloseTo(300, 1)

    // mover pelo meio: 40 cm para a direita, mesmo comprimento
    t = { ...t, pts: transladarLado(t.pts, [0, 1], { x: 40, y: 0 }, Hp, Hi) }
    expect(medirTraco(Hp, t)!.total).toBeCloseTo(300, 1)
    expect(Hp(t.pts[0]!).x).toBeCloseTo(90, 1)
  })

  test('inserir ponto num lado solto mantém a trava do outro lado', () => {
    const antes: Traco = { fechada: true, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], travados: { 2: 300 } }
    // "+" no lado 0 (entre os pontos 0 e 1): o novo ponto entra na posição 1
    const depois: Traco = { ...antes, pts: [antes.pts[0]!, { x: 5, y: 0 }, ...antes.pts.slice(1)] }
    expect(remapearTravas(antes, depois, (j) => (j >= 1 ? j + 1 : j))).toEqual({ 3: 300 })
  })

  test('sem referência não mede', () => {
    expect(medirTraco(null, { fechada: false, pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull()
  })
})
