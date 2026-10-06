import earcut from 'earcut'
import { areaComSinal, contornoExterno, mult, paredes, soma } from '../geometria'
import type { Comodo, Ponto, Projeto } from '../tipos'

/**
 * Modelo 3D em COLLADA (.dae): o SketchUp importa direto
 * (Arquivo → Importar → COLLADA). Paredes com altura do pé-direito, vãos de
 * portas e janelas recortados (com verga e peitoril) e piso de cada cômodo.
 * Unidade: metros, eixo Z para cima.
 */

interface Malha {
  pos: number[]
  tri: number[]
}

/** cm (tela) → m (3D, y invertido para a planta não sair espelhada) */
const v3 = (p: Ponto, z: number): [number, number, number] => [p.x / 100, -p.y / 100, z / 100]

function adicionarVertice(m: Malha, v: [number, number, number]): number {
  m.pos.push(...v)
  return m.pos.length / 3 - 1
}

/** Prisma vertical de base convexa entre as alturas z0 e z1 (em cm). */
function prisma(m: Malha, base: Ponto[], z0: number, z1: number) {
  if (z1 - z0 < 0.5) return
  // no 3D o y é invertido, então "horário na tela" vira anti-horário: é o que queremos
  const pts = areaComSinal(base) >= 0 ? base : [...base].reverse()
  const baixo = pts.map((p) => adicionarVertice(m, v3(p, z0)))
  const cima = pts.map((p) => adicionarVertice(m, v3(p, z1)))
  const n = pts.length
  for (let i = 1; i < n - 1; i++) {
    m.tri.push(cima[0]!, cima[i]!, cima[i + 1]!)
    m.tri.push(baixo[0]!, baixo[i + 1]!, baixo[i]!)
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    m.tri.push(baixo[i]!, baixo[j]!, cima[j]!)
    m.tri.push(baixo[i]!, cima[j]!, cima[i]!)
  }
}

function paredesDoComodo(m: Malha, c: Comodo, t: number) {
  const fora = contornoExterno(c.pontos, t)
  for (const p of paredes(c.pontos)) {
    const n = fora.length
    const extA = fora[p.i]!
    const extB = fora[(p.i + 1) % n]!
    const interno = (d: number) => soma(p.a, mult(p.d, d))
    const externo = (d: number) => (d <= 0 ? extA : d >= p.comprimento ? extB : soma(interno(d), mult(p.fora, t)))
    const pedaco = (de: number, ate: number, z0: number, z1: number) => {
      if (ate - de < 0.5) return
      prisma(m, [interno(de), interno(ate), externo(ate), externo(de)], z0, z1)
    }

    const vaos = c.aberturas
      .filter((ab) => ab.parede === p.i)
      .map((ab) => {
        const largura = Math.min(ab.largura, p.comprimento)
        const ini = Math.min(Math.max(ab.centro - largura / 2, 0), p.comprimento - largura)
        return { ini, fim: ini + largura, base: Math.max(0, ab.peitoril), topo: Math.min(c.peDireito, ab.peitoril + ab.altura) }
      })
      .sort((a, b) => a.ini - b.ini)

    let cursor = 0
    for (const v of vaos) {
      const ini = Math.max(v.ini, cursor)
      if (ini >= v.fim) continue
      pedaco(cursor, ini, 0, c.peDireito)
      pedaco(ini, v.fim, 0, v.base) // peitoril
      pedaco(ini, v.fim, v.topo, c.peDireito) // verga
      cursor = v.fim
    }
    pedaco(cursor, p.comprimento, 0, c.peDireito)
  }
}

function piso(m: Malha, c: Comodo) {
  const pts = areaComSinal(c.pontos) >= 0 ? c.pontos : [...c.pontos].reverse()
  const idx = pts.map((p) => adicionarVertice(m, v3(p, 0)))
  const tris = earcut(pts.flatMap((p) => [p.x / 100, -p.y / 100]))
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, d] = [pts[tris[i]!]!, pts[tris[i + 1]!]!, pts[tris[i + 2]!]!]
    // normal para cima (z+): anti-horário visto de cima no 3D = horário na tela
    const horarioNaTela = areaComSinal([a, b, d]) >= 0
    if (horarioNaTela) m.tri.push(idx[tris[i]!]!, idx[tris[i + 1]!]!, idx[tris[i + 2]!]!)
    else m.tri.push(idx[tris[i]!]!, idx[tris[i + 2]!]!, idx[tris[i + 1]!]!)
  }
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
const num = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(4).replace(/\.?0+$/, ''))

function geometria(id: string, nome: string, m: Malha, material: string): string {
  return `
    <geometry id="${id}" name="${esc(nome)}">
      <mesh>
        <source id="${id}-pos">
          <float_array id="${id}-pos-arr" count="${m.pos.length}">${m.pos.map(num).join(' ')}</float_array>
          <technique_common>
            <accessor source="#${id}-pos-arr" count="${m.pos.length / 3}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>
        <triangles material="${material}" count="${m.tri.length / 3}">
          <input semantic="VERTEX" source="#${id}-vtx" offset="0"/>
          <p>${m.tri.join(' ')}</p>
        </triangles>
      </mesh>
    </geometry>`
}

function efeito(id: string, rgb: [number, number, number]): string {
  return `
    <effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert>
      <diffuse><color>${rgb.join(' ')} 1</color></diffuse>
    </lambert></technique></profile_COMMON></effect>`
}

export function gerarDAE(projeto: Projeto): string {
  const t = projeto.espessuraParede
  const geos: string[] = []
  const nos: string[] = []
  projeto.comodos.forEach((c, i) => {
    const mp: Malha = { pos: [], tri: [] }
    paredesDoComodo(mp, c, t)
    const mf: Malha = { pos: [], tri: [] }
    piso(mf, c)
    const gp = `paredes-${i}`
    const gf = `piso-${i}`
    geos.push(geometria(gp, `${c.nome} - paredes`, mp, 'parede'), geometria(gf, `${c.nome} - piso`, mf, 'piso'))
    nos.push(`
      <node id="comodo-${i}" name="${esc(c.nome)}">
        <instance_geometry url="#${gp}"><bind_material><technique_common>
          <instance_material symbol="parede" target="#mat-parede"/>
        </technique_common></bind_material></instance_geometry>
        <instance_geometry url="#${gf}"><bind_material><technique_common>
          <instance_material symbol="piso" target="#mat-piso"/>
        </technique_common></bind_material></instance_geometry>
      </node>`)
  })

  const agora = new Date().toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>Planta IA</authoring_tool></contributor>
    <created>${agora}</created>
    <modified>${agora}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>${efeito('parede', [0.93, 0.92, 0.9])}${efeito('piso', [0.72, 0.6, 0.47])}
  </library_effects>
  <library_materials>
    <material id="mat-parede" name="Parede"><instance_effect url="#parede-fx"/></material>
    <material id="mat-piso" name="Piso"><instance_effect url="#piso-fx"/></material>
  </library_materials>
  <library_geometries>${geos.join('')}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="cena" name="${esc(projeto.nome)}">${nos.join('')}
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#cena"/></scene>
</COLLADA>
`
}
