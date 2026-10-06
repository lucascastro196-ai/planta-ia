import { describe, expect, test } from 'bun:test'
import { homografia, homografiaDaReferencia } from '../src/lib/homografia'
import { comodoDoContorno } from '../src/lib/montar'
import { areaComSinal } from '../src/lib/geometria'

/** Simula uma câmera olhando a parede de lado: projeção perspectiva de um plano. */
function camera(p: { x: number; y: number }) {
  const w = 1 + 0.0015 * p.x + 0.0004 * p.y
  return { x: (12 * p.x + 2 * p.y + 300) / w, y: (1 * p.x + 11 * p.y + 200) / w }
}

describe('medição na foto', () => {
  test('homografia leva os 4 pontos exatamente', () => {
    const de = [{ x: 10, y: 10 }, { x: 200, y: 30 }, { x: 190, y: 220 }, { x: 5, y: 180 }]
    const para = [{ x: 0, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 29.7 }, { x: 0, y: 29.7 }]
    const H = homografia(de, para)!
    de.forEach((p, i) => {
      expect(H(p).x).toBeCloseTo(para[i]!.x, 6)
      expect(H(p).y).toBeCloseTo(para[i]!.y, 6)
    })
  })

  test('A4 em perspectiva mede uma parede de 287 cm', () => {
    // folha A4 deitada encostada na parede, cantos marcados fora de ordem
    const folha = [{ x: 100, y: 50 }, { x: 129.7, y: 50 }, { x: 129.7, y: 71 }, { x: 100, y: 71 }].map(camera)
    const embaralhada = [folha[2]!, folha[0]!, folha[3]!, folha[1]!]
    const H = homografiaDaReferencia(embaralhada, 21, 29.7)!
    const a = H(camera({ x: 0, y: 200 }))
    const b = H(camera({ x: 287, y: 200 }))
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(287, 1)
  })
})

describe('contorno pela câmera', () => {
  test('cantos marcados no sentido anti-horário viram cômodo horário na posição pedida', () => {
    const c = comodoDoContorno('Sala', [{ x: -100, y: -50 }, { x: -100, y: 250 }, { x: 300, y: 250 }, { x: 300, y: -50 }], { x: 500, y: 0 })
    expect(areaComSinal(c.pontos)).toBeGreaterThan(0)
    expect(Math.min(...c.pontos.map((p) => p.x))).toBe(500)
    expect(areaComSinal(c.pontos) / 10000).toBeCloseTo(12, 5)
  })
})
