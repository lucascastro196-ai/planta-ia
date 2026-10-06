import { describe, expect, test } from 'bun:test'
import { detectarFolha, detectarQuinas, imagemDosPixels } from '../src/lib/detectar'
import { homografiaDaReferencia } from '../src/lib/homografia'

/** Foto sintética: parede clara entre duas paredes laterais mais escuras, folha A4 branca e um quadro. */
function foto(W: number, H: number, pintar: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(W * H * 4)
  let semente = 7
  const ruido = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 10
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pintar(x, y)
      const n = ruido()
      const i = (y * W + x) * 4
      rgba[i] = r + n
      rgba[i + 1] = g + n
      rgba[i + 2] = b + n
      rgba[i + 3] = 255
    }
  return rgba
}

describe('detecção automática na foto da parede', () => {
  // escala: 2 px por cm; parede de 320 cm entre x=80 e x=720
  const W = 800
  const H = 600
  const rgba = foto(W, H, (x, y) => {
    if (x < 80 || x >= 720) return [110, 105, 100] // paredes laterais (sombra)
    if (x >= 300 && x < 342 && y >= 200 && y < 259.4) return [245, 245, 242] // A4 em pé: 21 × 29,7 cm
    if (x >= 450 && x < 600 && y >= 150 && y < 250) return [60, 50, 40] // quadro escuro
    if (y > 520) return [90, 80, 70] // piso
    return [200, 190, 175] // parede
  })
  const im = imagemDosPixels(rgba, W, H)

  test('acha a folha e os cantos dela', () => {
    const cantos = detectarFolha(im)!
    expect(cantos).not.toBeNull()
    const xs = cantos.map((p) => p.x)
    const ys = cantos.map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(300, -0.5)
    expect(Math.max(...xs)).toBeCloseTo(342, -0.5)
    expect(Math.min(...ys)).toBeCloseTo(200, -0.5)
    expect(Math.max(...ys)).toBeCloseTo(259.4, -0.5)
  })

  test('acha as quinas e a parede mede ~320 cm', () => {
    const cantos = detectarFolha(im)!
    const [a, b] = detectarQuinas(im, cantos)
    expect(a.x).toBeCloseTo(80, -1)
    expect(b.x).toBeCloseTo(720, -1)
    const Hm = homografiaDaReferencia(cantos, 21, 29.7)!
    const pa = Hm(a)
    const pb = Hm(b)
    const cm = Math.hypot(pa.x - pb.x, pa.y - pb.y)
    expect(Math.abs(cm - 320)).toBeLessThan(320 * 0.03)
  })

  test('sem folha na foto, avisa (null)', () => {
    const sem = imagemDosPixels(
      foto(400, 300, () => [180, 170, 160]),
      400,
      300,
    )
    expect(detectarFolha(sem)).toBeNull()
  })
})
