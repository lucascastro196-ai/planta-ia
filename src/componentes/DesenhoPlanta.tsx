import { areaM2, centroide, contornoExterno, geoAbertura, metros, mult, paredes, soma, sub, type GeoAbertura } from '@/lib/geometria'
import type { Abertura, Comodo, Ponto, Projeto } from '@/lib/tipos'

/**
 * O desenho técnico da planta (sem nada interativo). Medidas em cm.
 * O mesmo componente serve para a tela e para o PDF, por isso as cores são fixas.
 */

export const COR = {
  parede: '#1c1917',
  piso: '#ffffff',
  linha: '#1c1917',
  cota: '#57534e',
  texto: '#1c1917',
} as const

export const FONTE = 'Helvetica, Arial, sans-serif'

const caminho = (pts: Ponto[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'

function anguloLegivel(d: Ponto): number {
  let ang = (Math.atan2(d.y, d.x) * 180) / Math.PI
  if (ang > 90.5) ang -= 180
  if (ang <= -89.5) ang += 180
  return ang
}

function Texto({ p, ang = 0, tam, peso, cor = COR.texto, children }: { p: Ponto; ang?: number; tam: number; peso?: number; cor?: string; children: string }) {
  return (
    <text
      x={p.x}
      y={p.y + tam * 0.35}
      fontSize={tam}
      fontFamily={FONTE}
      fontWeight={peso}
      fill={cor}
      textAnchor="middle"
      transform={ang ? `rotate(${ang.toFixed(2)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})` : undefined}
    >
      {children}
    </text>
  )
}

function Linha({ a, b, larg = 1, cor = COR.linha }: { a: Ponto; b: Ponto; larg?: number; cor?: string }) {
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={cor} strokeWidth={larg} />
}

function SimboloAbertura({ ab, g }: { ab: Abertura; g: GeoAbertura }) {
  const { a, b, aFora, bFora, parede } = g
  const dentro = mult(parede.fora, -1)
  const vao = <path d={caminho([a, b, bFora, aFora])} fill={COR.piso} stroke="none" />
  if (ab.tipo === 'janela') {
    const meioA = soma(a, mult(sub(aFora, a), 0.5))
    const meioB = soma(b, mult(sub(bFora, b), 0.5))
    return (
      <g>
        {vao}
        <Linha a={a} b={aFora} />
        <Linha a={b} b={bFora} />
        <Linha a={a} b={b} larg={0.8} />
        <Linha a={aFora} b={bFora} larg={0.8} />
        <Linha a={meioA} b={meioB} larg={1.6} />
      </g>
    )
  }
  const dobradica = ab.inverter ? b : a
  const outro = ab.inverter ? a : b
  const w = g.fim - g.ini
  const folha = soma(dobradica, mult(dentro, w))
  const u = sub(folha, dobradica)
  const v = sub(outro, dobradica)
  const horario = u.x * v.y - u.y * v.x > 0 ? 1 : 0
  return (
    <g>
      {vao}
      <Linha a={a} b={aFora} />
      <Linha a={b} b={bFora} />
      <Linha a={dobradica} b={folha} larg={2} />
      <path d={`M${folha.x} ${folha.y} A${w} ${w} 0 0 ${horario} ${outro.x} ${outro.y}`} fill="none" stroke={COR.linha} strokeWidth={0.7} strokeDasharray="6 4" />
    </g>
  )
}

function rotuloAbertura(ab: Abertura): string {
  const t = `${metros(ab.largura)}×${metros(ab.altura)}`
  return ab.tipo === 'porta' ? `P ${t}` : `J ${t}/${metros(ab.peitoril)}`
}

export function Cotas({ comodo, espessura }: { comodo: Comodo; espessura: number }) {
  const deslocamento = espessura + 35
  return (
    <g>
      {paredes(comodo.pontos).map((p) => {
        if (p.comprimento < 5) return null
        const a = soma(p.a, mult(p.fora, deslocamento))
        const b = soma(p.b, mult(p.fora, deslocamento))
        const tique = mult(soma(p.d, p.fora), 5)
        const meio = soma(mult(soma(a, b), 0.5), mult(p.fora, 11))
        return (
          <g key={p.i}>
            <Linha a={soma(p.a, mult(p.fora, espessura + 6))} b={soma(a, mult(p.fora, 6))} larg={0.5} cor={COR.cota} />
            <Linha a={soma(p.b, mult(p.fora, espessura + 6))} b={soma(b, mult(p.fora, 6))} larg={0.5} cor={COR.cota} />
            <Linha a={a} b={b} larg={0.6} cor={COR.cota} />
            <Linha a={sub(a, tique)} b={soma(a, tique)} larg={1.2} cor={COR.cota} />
            <Linha a={sub(b, tique)} b={soma(b, tique)} larg={1.2} cor={COR.cota} />
            <Texto p={meio} ang={anguloLegivel(p.d)} tam={14} cor={COR.cota}>
              {metros(p.comprimento)}
            </Texto>
          </g>
        )
      })}
    </g>
  )
}

/**
 * Desenha em camadas (pisos, paredes, vãos, textos) para que uma porta entre
 * dois cômodos corte também a parede do vizinho, que fica no mesmo lugar.
 */
export function DesenhoPlanta({ projeto, cotas = true }: { projeto: Projeto; cotas?: boolean }) {
  const t = projeto.espessuraParede
  const cs = projeto.comodos
  return (
    <g>
      {cs.map((c) => (
        <path key={c.id} d={caminho(c.pontos)} fill={COR.piso} />
      ))}
      {cs.map((c) => (
        <path key={c.id} d={`${caminho(contornoExterno(c.pontos, t))} ${caminho(c.pontos)}`} fill={COR.parede} fillRule="evenodd" />
      ))}
      {cs.map((c) => (
        <Aberturas key={c.id} comodo={c} espessura={t} />
      ))}
      {cotas && cs.map((c) => <Cotas key={c.id} comodo={c} espessura={t} />)}
      {cs.map((c) => (
        <Rotulo key={c.id} comodo={c} />
      ))}
    </g>
  )
}

function Aberturas({ comodo, espessura }: { comodo: Comodo; espessura: number }) {
  return (
    <g>
      {comodo.aberturas.map((ab) => {
        const g = geoAbertura(comodo, ab, espessura)
        if (!g) return null
        const rotulo = soma(mult(soma(g.a, g.b), 0.5), mult(g.parede.fora, -16))
        return (
          <g key={ab.id}>
            <SimboloAbertura ab={ab} g={g} />
            <Texto p={rotulo} ang={anguloLegivel(g.parede.d)} tam={8} cor={COR.cota}>
              {rotuloAbertura(ab)}
            </Texto>
          </g>
        )
      })}
    </g>
  )
}

function Rotulo({ comodo }: { comodo: Comodo }) {
  const centro = centroide(comodo.pontos)
  return (
    <g>
      <Texto p={{ x: centro.x, y: centro.y - 10 }} tam={18} peso={700}>
        {comodo.nome}
      </Texto>
      <Texto p={{ x: centro.x, y: centro.y + 12 }} tam={12}>
        {`${areaM2(comodo.pontos).toFixed(2).replace('.', ',')} m²`}
      </Texto>
      <Texto p={{ x: centro.x, y: centro.y + 28 }} tam={10} cor={COR.cota}>
        {`PD ${metros(comodo.peDireito)}`}
      </Texto>
    </g>
  )
}
