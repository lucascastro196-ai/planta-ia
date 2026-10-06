import { centroide, contornoExterno, geoAbertura, metros, mult, paredes, soma, areaM2, type Parede } from '../geometria'
import type { Ponto, Projeto } from '../tipos'

/**
 * DXF R12 (ASCII), o formato que qualquer versão do AutoCAD, BricsCAD,
 * LibreCAD ou SketchUp Pro abre. Unidade: metros. Eixo y para cima.
 */

const CAMADAS: [nome: string, cor: number][] = [
  ['PAREDES', 7],
  ['PORTAS', 3],
  ['JANELAS', 5],
  ['COTAS', 8],
  ['TEXTOS', 7],
]

class Escritor {
  private linhas: string[] = []
  par(codigo: number, valor: string | number) {
    this.linhas.push(String(codigo), typeof valor === 'number' ? fmt(valor) : valor)
  }
  texto() {
    return this.linhas.join('\r\n') + '\r\n'
  }
}

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(4).replace(/\.?0+$/, ''))
/** cm (tela, y para baixo) → m (CAD, y para cima) */
const m = (p: Ponto): Ponto => ({ x: p.x / 100, y: -p.y / 100 })

export function gerarDXF(projeto: Projeto): string {
  const w = new Escritor()
  const t = projeto.espessuraParede

  w.par(0, 'SECTION')
  w.par(2, 'HEADER')
  w.par(9, '$ACADVER')
  w.par(1, 'AC1009')
  w.par(0, 'ENDSEC')

  w.par(0, 'SECTION')
  w.par(2, 'TABLES')
  w.par(0, 'TABLE')
  w.par(2, 'LTYPE')
  w.par(70, 1)
  w.par(0, 'LTYPE')
  w.par(2, 'CONTINUOUS')
  w.par(70, 0)
  w.par(3, 'Solid line')
  w.par(72, 65)
  w.par(73, 0)
  w.par(40, 0)
  w.par(0, 'ENDTAB')
  w.par(0, 'TABLE')
  w.par(2, 'LAYER')
  w.par(70, CAMADAS.length)
  for (const [nome, cor] of CAMADAS) {
    w.par(0, 'LAYER')
    w.par(2, nome)
    w.par(70, 0)
    w.par(62, cor)
    w.par(6, 'CONTINUOUS')
  }
  w.par(0, 'ENDTAB')
  w.par(0, 'ENDSEC')

  w.par(0, 'SECTION')
  w.par(2, 'ENTITIES')

  const linha = (camada: string, a: Ponto, b: Ponto) => {
    const A = m(a)
    const B = m(b)
    w.par(0, 'LINE')
    w.par(8, camada)
    w.par(10, A.x)
    w.par(20, A.y)
    w.par(30, 0)
    w.par(11, B.x)
    w.par(21, B.y)
    w.par(31, 0)
  }
  const texto = (camada: string, p: Ponto, altura: number, valor: string, angulo = 0) => {
    const P = m(p)
    w.par(0, 'TEXT')
    w.par(8, camada)
    w.par(10, P.x)
    w.par(20, P.y)
    w.par(30, 0)
    w.par(40, altura / 100)
    w.par(1, valor)
    if (angulo) w.par(50, angulo)
    w.par(72, 1) // centralizado
    w.par(11, P.x)
    w.par(21, P.y)
    w.par(31, 0)
  }
  const arco = (camada: string, centro: Ponto, raio: number, de: Ponto, ate: Ponto) => {
    const C = m(centro)
    const ang = (p: Ponto) => {
      const P = m(p)
      return ((Math.atan2(P.y - C.y, P.x - C.x) * 180) / Math.PI + 360) % 360
    }
    let a1 = ang(de)
    let a2 = ang(ate)
    // DXF desenha no sentido anti-horário: escolhe a ordem que dá o quarto de volta
    if ((a2 - a1 + 360) % 360 > 180) [a1, a2] = [a2, a1]
    w.par(0, 'ARC')
    w.par(8, camada)
    w.par(10, C.x)
    w.par(20, C.y)
    w.par(30, 0)
    w.par(40, raio / 100)
    w.par(50, a1)
    w.par(51, a2)
  }

  for (const c of projeto.comodos) {
    const fora = contornoExterno(c.pontos, t)
    const ps = paredes(c.pontos)
    for (const p of ps) {
      // faces interna e externa, interrompidas nos vãos
      const vaos = c.aberturas
        .filter((ab) => ab.parede === p.i)
        .map((ab) => geoAbertura(c, ab, t))
        .filter((g) => g !== null)
        .sort((x, y) => x.ini - y.ini)
      const ext = { a: fora[p.i]!, b: fora[(p.i + 1) % fora.length]! }
      let cursor = 0
      for (const g of vaos) {
        if (g.ini > cursor) {
          linha('PAREDES', pontoInterno(p, cursor), pontoInterno(p, g.ini))
          linha('PAREDES', cursor === 0 ? ext.a : soma(pontoInterno(p, cursor), mult(p.fora, t)), g.aFora)
        }
        linha('PAREDES', g.a, g.aFora)
        linha('PAREDES', g.b, g.bFora)
        cursor = Math.max(cursor, g.fim)
      }
      if (cursor < p.comprimento) {
        linha('PAREDES', pontoInterno(p, cursor), p.b)
        linha('PAREDES', cursor === 0 ? ext.a : soma(pontoInterno(p, cursor), mult(p.fora, t)), ext.b)
      }

      // cota da parede
      const d = t + 35
      const ca = soma(p.a, mult(p.fora, d))
      const cb = soma(p.b, mult(p.fora, d))
      linha('COTAS', ca, cb)
      linha('COTAS', soma(p.a, mult(p.fora, t + 6)), soma(ca, mult(p.fora, 6)))
      linha('COTAS', soma(p.b, mult(p.fora, t + 6)), soma(cb, mult(p.fora, 6)))
      const D = m(p.d)
      let ang = (Math.atan2(D.y, D.x) * 180) / Math.PI
      if (ang > 90.5) ang -= 180
      if (ang <= -89.5) ang += 180
      texto('COTAS', soma(mult(soma(ca, cb), 0.5), mult(p.fora, 8)), 12, metros(p.comprimento), ang)
    }

    for (const ab of c.aberturas) {
      const g = geoAbertura(c, ab, t)
      if (!g) continue
      if (ab.tipo === 'janela') {
        linha('JANELAS', g.a, g.b)
        linha('JANELAS', g.aFora, g.bFora)
        linha('JANELAS', soma(g.a, mult(g.parede.fora, t / 2)), soma(g.b, mult(g.parede.fora, t / 2)))
      } else {
        const dobradica = ab.inverter ? g.b : g.a
        const outro = ab.inverter ? g.a : g.b
        const w = g.fim - g.ini
        const folha = soma(dobradica, mult(g.parede.fora, -w))
        linha('PORTAS', dobradica, folha)
        arco('PORTAS', dobradica, w, folha, outro)
      }
    }

    const cen = centroide(c.pontos)
    texto('TEXTOS', { x: cen.x, y: cen.y - 8 }, 18, c.nome)
    texto('TEXTOS', { x: cen.x, y: cen.y + 14 }, 12, `${areaM2(c.pontos).toFixed(2).replace('.', ',')} m2`)
  }

  w.par(0, 'ENDSEC')
  w.par(0, 'EOF')
  return w.texto()
}

const pontoInterno = (p: Parede, dist: number): Ponto => soma(p.a, mult(p.d, dist))

