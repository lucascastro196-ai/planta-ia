import { useState } from 'react'
import { CornerDownLeft, CornerDownRight, Crosshair, Plus, Ruler, Square, Trash2, X } from 'lucide-react'
import { comodoDasParedes, comodoRetangular, erroDeFechamento, poligonoDasParedes, type ParedeMedida } from '@/lib/montar'
import type { Comodo, Ponto } from '@/lib/tipos'
import { Medidor } from './Medidor'

interface Props {
  posicao: Ponto
  onFechar: () => void
  onCriar: (c: Comodo) => void
  /** abre a câmera AR para contornar o piso */
  onContornar: () => void
}

type Linha = { valor: string; giro: 90 | -90 }

const numero = (s: string) => Number(s.replace(',', '.'))
const cm = (n: number) => n.toFixed(1).replace('.0', '').replace('.', ',')

/** Desenho pequeno do cômodo enquanto as paredes são digitadas. */
function Previa({ lista }: { lista: ParedeMedida[] }) {
  if (lista.length < 3) return null
  const pts = poligonoDasParedes(lista)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX || 1
  const h = Math.max(...ys) - minY || 1
  const m = Math.max(w, h) * 0.12
  const meio = (i: number) => {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const fonte = Math.max(w, h) * 0.1
  return (
    <svg viewBox={`${minX - m} ${minY - m} ${w + 2 * m} ${h + 2 * m}`} className="mx-auto h-36 w-full">
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="#fff7ed" stroke="#1c1917" strokeWidth={Math.max(w, h) * 0.02} strokeLinejoin="round" />
      {pts.map((_, i) => (
        <text key={i} x={meio(i).x} y={meio(i).y} fontSize={fonte} textAnchor="middle" dominantBaseline="middle" fill="#ea580c" fontWeight={700}>
          {i + 1}
        </text>
      ))}
    </svg>
  )
}

export function NovoComodo({ posicao, onFechar, onCriar, onContornar }: Props) {
  const [modo, setModo] = useState<'paredes' | 'retangulo'>('paredes')
  const [nome, setNome] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([
    { valor: '', giro: 90 },
    { valor: '', giro: 90 },
    { valor: '', giro: 90 },
    { valor: '', giro: 90 },
  ])
  const [peDireito, setPeDireito] = useState('')
  const [largura, setLargura] = useState('300')
  const [profundidade, setProfundidade] = useState('400')
  const [erro, setErro] = useState<string | null>(null)
  const [medindo, setMedindo] = useState<number | 'pd' | 'largura' | 'profundidade' | null>(null)

  const lista: ParedeMedida[] = linhas.map((l) => ({ comprimento: numero(l.valor), giro: l.giro }))
  const completa = lista.length >= 3 && lista.every((p) => p.comprimento > 0)
  const sobra = completa ? erroDeFechamento(lista) : 0
  const somaGiros = linhas.reduce((s, l) => s + l.giro, 0)

  function criar() {
    setErro(null)
    const pd = numero(peDireito)
    if (modo === 'retangulo') {
      const w = numero(largura)
      const h = numero(profundidade)
      if (!(w >= 30 && h >= 30)) return setErro('Informe largura e profundidade em centímetros.')
      const c = comodoRetangular(nome || 'Cômodo', w, h, posicao)
      return onCriar(pd > 0 ? { ...c, peDireito: pd } : c)
    }
    if (!completa) return setErro('Preencha o comprimento de todas as paredes (em cm).')
    if (Math.abs(somaGiros) !== 360) return setErro('Os cantos não fecham o cômodo: andando pelas paredes, as viradas à direita menos as à esquerda devem somar 4.')
    onCriar(comodoDasParedes(nome || 'Cômodo', lista, pd, posicao))
  }

  const campo = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-stone-600 dark:bg-stone-800'
  const regua = (alvo: NonNullable<typeof medindo>, rotulo: string) => (
    <button type="button" className="shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-orange-600 dark:hover:bg-stone-800" onClick={() => setMedindo(alvo)} aria-label={rotulo} title="Medir com a câmera">
      <Ruler size={18} />
    </button>
  )

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onFechar}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Novo cômodo</h2>
          <button className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <button
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-left text-sm hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950"
          onClick={onContornar}
        >
          <Crosshair size={22} className="shrink-0 text-orange-600" />
          <span>
            <b>Contornar o piso com a câmera</b>
            <span className="block text-xs text-stone-600 dark:text-stone-400">Marque os cantos e o cômodo sai pronto, com medidas reais (Android/Chrome).</span>
          </span>
        </button>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800">
          {(['paredes', 'retangulo'] as const).map((m) => (
            <button key={m} className={`rounded-md py-1.5 ${modo === m ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`} onClick={() => setModo(m)}>
              {m === 'paredes' ? 'Parede por parede' : 'Retângulo'}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-[1fr_9rem] gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Sala, Quarto 1" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Pé-direito (cm)</span>
            <span className="flex">
              <input className={campo} inputMode="decimal" placeholder="270" value={peDireito} onChange={(e) => setPeDireito(e.target.value)} />
              {regua('pd', 'Medir pé-direito com a câmera')}
            </span>
          </label>
        </div>

        {modo === 'retangulo' ? (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Largura (cm)</span>
              <span className="flex">
                <input className={campo} inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} />
                {regua('largura', 'Medir largura com a câmera')}
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Profundidade (cm)</span>
              <span className="flex">
                <input className={campo} inputMode="decimal" value={profundidade} onChange={(e) => setProfundidade(e.target.value)} />
                {regua('profundidade', 'Medir profundidade com a câmera')}
              </span>
            </label>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-stone-500">
              Comece por uma parede e vá seguindo ao redor do cômodo, sempre no mesmo sentido (com a parede à sua esquerda). No fim de cada parede diga se o canto
              vira à direita (canto normal) ou à esquerda (canto de dentro de um L).
            </p>
            <div className="mb-2 space-y-2">
              {linhas.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-orange-600">{i + 1}</span>
                  <input
                    className={campo}
                    inputMode="decimal"
                    placeholder="comprimento em cm"
                    value={l.valor}
                    onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  />
                  {regua(i, `Medir parede ${i + 1} com a câmera`)}
                  <button
                    className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-2 text-xs dark:border-stone-600"
                    onClick={() => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, giro: x.giro === 90 ? -90 : 90 } : x)))}
                    title="Para onde o canto vira no fim desta parede"
                  >
                    {l.giro === 90 ? <CornerDownRight size={14} /> : <CornerDownLeft size={14} />}
                    {l.giro === 90 ? 'direita' : 'esquerda'}
                  </button>
                  {linhas.length > 3 && (
                    <button className="shrink-0 p-1 text-stone-400 hover:text-red-600" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover parede">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="mb-3 flex items-center gap-1 text-sm text-orange-600" onClick={() => setLinhas((ls) => [...ls, { valor: '', giro: 90 }])}>
              <Plus size={16} /> Outra parede
            </button>
            {completa && Math.abs(somaGiros) === 360 && (
              <div className="mb-3 rounded-lg bg-stone-50 p-2 dark:bg-stone-800">
                <Previa lista={lista} />
                <p className={`text-center text-xs ${sobra > 10 ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500'}`}>
                  {sobra < 0.5
                    ? 'As medidas fecham certinho.'
                    : `As medidas não fecham por ${cm(sobra)} cm; a diferença será repartida entre as paredes.${sobra > 10 ? ' Vale conferir.' : ''}`}
                </p>
              </div>
            )}
          </>
        )}

        {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 font-medium text-white dark:bg-orange-600" onClick={criar}>
          <Square size={18} /> Criar cômodo
        </button>
      </div>

      {medindo !== null && (
        // o clique dentro do medidor não pode chegar no fundo deste diálogo (que fecharia tudo)
        <div onClick={(e) => e.stopPropagation()}>
          <Medidor
            titulo={typeof medindo === 'number' ? `Medir a parede ${medindo + 1}` : medindo === 'pd' ? 'Medir o pé-direito' : `Medir a ${medindo}`}
            onFechar={() => setMedindo(null)}
            onUsar={(v) => {
              const valor = cm(v)
              if (medindo === 'pd') setPeDireito(valor)
              else if (medindo === 'largura') setLargura(valor)
              else if (medindo === 'profundidade') setProfundidade(valor)
              else setLinhas((ls) => ls.map((x, j) => (j === medindo ? { ...x, valor } : x)))
              setMedindo(null)
            }}
          />
        </div>
      )}
    </div>
  )
}
