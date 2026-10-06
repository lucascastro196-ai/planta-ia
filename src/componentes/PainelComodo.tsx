import { useEffect, useState } from 'react'
import { AlertTriangle, Camera, DoorOpen, Images, PanelTop, Plus, Ruler, Trash2, X } from 'lucide-react'
import { areaM2, esticarParede, metros, paredes } from '@/lib/geometria'
import { novoId, type Abertura, type Comodo } from '@/lib/tipos'
import { Medidor } from './Medidor'

interface Props {
  comodo: Comodo
  onAlterar: (c: Comodo) => void
  onExcluir: () => void
  onFechar: () => void
  /** quantas fotos com medidas estão ligadas a este cômodo */
  fotos: number
  onVerFotos: () => void
}

/** Campo numérico em metros que só aplica ao sair (ou Enter), para não refazer a planta a cada tecla. */
function CampoMetros({ cm, onMudar, min = 0 }: { cm: number; onMudar: (cm: number) => void; min?: number }) {
  const [texto, setTexto] = useState(metros(cm))
  useEffect(() => setTexto(metros(cm)), [cm])
  const aplicar = () => {
    const v = Number(texto.replace(',', '.'))
    if (Number.isFinite(v) && v * 100 >= min && Math.abs(v * 100 - cm) > 0.05) onMudar(Math.round(v * 1000) / 10)
    else setTexto(metros(cm))
  }
  return (
    <input
      className="w-20 rounded-md border border-stone-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-orange-500 dark:border-stone-600 dark:bg-stone-800"
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

export function PainelComodo({ comodo, onAlterar, onExcluir, onFechar, fotos, onVerFotos }: Props) {
  const ps = paredes(comodo.pontos)
  const [medindo, setMedindo] = useState<number | 'pd' | 'foto' | null>(null)
  /** parede medida por foto (detecção automática) */
  const [fotoParede, setFotoParede] = useState<number | null>(null)
  const botaoMedir = (alvo: number | 'pd') => (
    <button className="rounded-md p-1 text-stone-400 hover:text-orange-600" onClick={() => setMedindo(alvo)} aria-label="Medir com a câmera" title="Medir com a câmera">
      <Ruler size={15} />
    </button>
  )
  const mudarAbertura = (id: string, f: Partial<Abertura>) =>
    onAlterar({ ...comodo, aberturas: comodo.aberturas.map((a) => (a.id === id ? { ...a, ...f } : a)) })

  const novaAbertura = (tipo: Abertura['tipo']) => {
    const p = ps.reduce((m, x) => (x.comprimento > m.comprimento ? x : m), ps[0]!)
    const ab: Abertura =
      tipo === 'porta'
        ? { id: novoId(), tipo, parede: p.i, centro: p.comprimento / 2, largura: 80, altura: 210, peitoril: 0 }
        : { id: novoId(), tipo, parede: p.i, centro: p.comprimento / 2, largura: 120, altura: 100, peitoril: 110 }
    onAlterar({ ...comodo, aberturas: [...comodo.aberturas, ab] })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none hover:border-stone-300 focus:border-orange-500"
          value={comodo.nome}
          onChange={(e) => onAlterar({ ...comodo, nome: e.target.value })}
        />
        <button className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onFechar} aria-label="Fechar painel">
          <X size={18} />
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800">
        <span>
          Área <strong className="tabular-nums">{areaM2(comodo.pontos).toFixed(2).replace('.', ',')} m²</strong>
        </span>
        <span className="flex items-center gap-2">
          Pé-direito
          <CampoMetros cm={comodo.peDireito} min={150} onMudar={(v) => onAlterar({ ...comodo, peDireito: v })} />
          {botaoMedir('pd')}
        </span>
      </div>

      {comodo.observacoes && comodo.observacoes.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle size={15} /> Conferir com trena{comodo.confianca ? ` · confiança ${comodo.confianca === 'media' ? 'média' : comodo.confianca}` : ''}
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {comodo.observacoes.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mb-1 font-medium">Paredes (face interna, m)</h3>
      <p className="mb-2 text-xs text-stone-500">Mudar uma medida estica o cômodo naquela direção. Os cantos também podem ser arrastados na planta.</p>
      <div className="mb-4 space-y-1">
        {ps.map((p) => (
          <div key={p.i} className="flex items-center justify-between">
            <span className="text-stone-600 dark:text-stone-400">Parede {p.i + 1}</span>
            <span className="flex items-center gap-1">
              <CampoMetros cm={p.comprimento} min={10} onMudar={(v) => onAlterar({ ...comodo, pontos: esticarParede(comodo.pontos, p.i, v) })} />
              {botaoMedir(p.i)}
              <button
                className="rounded-md p-1 text-stone-400 hover:text-orange-600"
                onClick={() => setFotoParede(p.i)}
                aria-label={`Medir a parede ${p.i + 1} por foto`}
                title="Foto da parede: medida automática"
              >
                <Camera size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium">Portas e janelas</h3>
        <div className="flex gap-1">
          <button className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800" onClick={() => novaAbertura('porta')}>
            <Plus size={12} /> Porta
          </button>
          <button className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800" onClick={() => novaAbertura('janela')}>
            <Plus size={12} /> Janela
          </button>
        </div>
      </div>
      <div className="mb-4 space-y-2">
        {comodo.aberturas.length === 0 && <p className="text-xs text-stone-500">Nenhuma.</p>}
        {comodo.aberturas.map((a) => {
          const p = ps[a.parede]
          return (
            <div key={a.id} className="rounded-lg border border-stone-200 p-2 dark:border-stone-700">
              <div className="mb-2 flex items-center gap-2">
                {a.tipo === 'porta' ? <DoorOpen size={16} /> : <PanelTop size={16} />}
                <span className="font-medium">{a.tipo === 'porta' ? 'Porta' : 'Janela'}</span>
                <select
                  className="ml-auto rounded-md border border-stone-300 bg-white px-1 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
                  value={a.parede}
                  onChange={(e) => mudarAbertura(a.id, { parede: Number(e.target.value), centro: (ps[Number(e.target.value)]?.comprimento ?? 0) / 2 })}
                >
                  {ps.map((x) => (
                    <option key={x.i} value={x.i}>
                      Parede {x.i + 1}
                    </option>
                  ))}
                </select>
                <button className="p-1 text-stone-400 hover:text-red-600" onClick={() => onAlterar({ ...comodo, aberturas: comodo.aberturas.filter((x) => x.id !== a.id) })} aria-label="Remover">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <label className="flex items-center justify-between gap-1">
                  Do início
                  <CampoMetros cm={Math.max(0, a.centro - a.largura / 2)} onMudar={(v) => mudarAbertura(a.id, { centro: v + a.largura / 2 })} />
                </label>
                <label className="flex items-center justify-between gap-1">
                  Largura
                  <CampoMetros cm={a.largura} min={20} onMudar={(v) => mudarAbertura(a.id, { largura: Math.min(v, p?.comprimento ?? v), centro: a.centro - a.largura / 2 + v / 2 })} />
                </label>
                <label className="flex items-center justify-between gap-1">
                  Altura
                  <CampoMetros cm={a.altura} min={20} onMudar={(v) => mudarAbertura(a.id, { altura: v })} />
                </label>
                {a.tipo === 'janela' ? (
                  <label className="flex items-center justify-between gap-1">
                    Peitoril
                    <CampoMetros cm={a.peitoril} onMudar={(v) => mudarAbertura(a.id, { peitoril: v })} />
                  </label>
                ) : (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!a.inverter} onChange={(e) => mudarAbertura(a.id, { inverter: e.target.checked })} />
                    Inverter abertura
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Fotos com medidas</h3>
        <div className="flex gap-1">
          {fotos > 0 && (
            <button className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800" onClick={onVerFotos}>
              <Images size={12} /> Ver ({fotos})
            </button>
          )}
          <button className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800" onClick={() => setMedindo('foto')}>
            <Camera size={12} /> Medir na foto
          </button>
        </div>
      </div>

      <button className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" onClick={onExcluir}>
        <Trash2 size={15} /> Excluir cômodo
      </button>
      {fotoParede !== null && (
        <Medidor
          titulo={`Parede ${fotoParede + 1} por foto`}
          paraParede={`Parede ${fotoParede + 1}`}
          comodoId={comodo.id}
          tituloFoto={`${comodo.nome} - parede ${fotoParede + 1}`}
          onFechar={() => setFotoParede(null)}
          onUsar={(cm) => {
            onAlterar({ ...comodo, pontos: esticarParede(comodo.pontos, fotoParede, cm) })
            setFotoParede(null)
          }}
        />
      )}
      {medindo !== null && (
        <Medidor
          titulo={medindo === 'foto' ? `Medir na foto — ${comodo.nome}` : medindo === 'pd' ? 'Medir o pé-direito' : `Medir a parede ${medindo + 1}`}
          onFechar={() => setMedindo(null)}
          comodoId={comodo.id}
          tituloFoto={comodo.nome}
          onUsar={
            medindo === 'foto'
              ? undefined
              : (cm) => {
                  if (medindo === 'pd') onAlterar({ ...comodo, peDireito: cm })
                  else onAlterar({ ...comodo, pontos: esticarParede(comodo.pontos, medindo, cm) })
                  setMedindo(null)
                }
          }
        />
      )}
    </div>
  )
}
