import { describe, expect, test } from 'bun:test'
import { homografia } from '../src/lib/homografia'
import { medirTraco, segmentos } from '../src/lib/traco'

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

  test('sem referência não mede', () => {
    expect(medirTraco(null, { fechada: false, pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull()
  })
})
