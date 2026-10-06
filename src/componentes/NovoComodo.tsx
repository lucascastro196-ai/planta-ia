import { useState } from 'react'
import { Camera, Loader2, Plus, Ruler, Square, Trash2, X } from 'lucide-react'
import { prepararFoto } from '@/lib/imagem'
import type { FotoEnviada, LeituraComodo, MedidaInformada, PedidoAnalise } from '@/lib/leitura'
import { Medidor } from './Medidor'

type Foto = FotoEnviada & { previa: string; id: string }

interface Props {
  onFechar: () => void
  onLeitura: (l: LeituraComodo) => void
  onRetangulo: (nome: string, larguraCm: number, profundidadeCm: number) => void
}

const numero = (s: string) => Number(s.replace(',', '.'))

export function NovoComodo({ onFechar, onLeitura, onRetangulo }: Props) {
  const [modo, setModo] = useState<'fotos' | 'manual'>('fotos')
  const [nome, setNome] = useState('')
  const [fotos, setFotos] = useState<Foto[]>([])
  const [medidas, setMedidas] = useState<{ descricao: string; valor: string }[]>([{ descricao: '', valor: '' }])
  const [peDireito, setPeDireito] = useState('')
  const [observacao, setObservacao] = useState('')
  const [largura, setLargura] = useState('3,00')
  const [profundidade, setProfundidade] = useState('4,00')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [medindo, setMedindo] = useState<number | 'pd' | null>(null)

  async function adicionarFotos(lista: FileList | null) {
    if (!lista) return
    setErro(null)
    try {
      const novas = await Promise.all([...lista].map(async (f) => ({ ...(await prepararFoto(f)), id: crypto.randomUUID() })))
      setFotos((atual) => [...atual, ...novas].slice(0, 10))
    } catch {
      setErro('Não consegui abrir uma das fotos. Use JPG, PNG ou HEIC convertido.')
    }
  }

  const medidasValidas: MedidaInformada[] = medidas
    .filter((m) => m.descricao.trim() && numero(m.valor) > 0)
    .map((m) => ({ descricao: m.descricao.trim(), metros: numero(m.valor) / 100 }))

  async function gerar() {
    setErro(null)
    if (fotos.length === 0) return setErro('Adicione as fotos do cômodo.')
    if (medidasValidas.length === 0) return setErro('Informe pelo menos uma medida (o que foi medido e quantos centímetros deu).')
    setEnviando(true)
    try {
      const pedido: PedidoAnalise = {
        nome: nome.trim() || undefined,
        fotos: fotos.map(({ media_type, data }) => ({ media_type, data })),
        medidas: medidasValidas,
        peDireitoMetros: numero(peDireito) > 0 ? numero(peDireito) / 100 : undefined,
        observacao: observacao.trim() || undefined,
      }
      const r = await fetch('/api/analisar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pedido) })
      const corpo = (await r.json().catch(() => ({}))) as { leitura?: LeituraComodo; erro?: string }
      if (!r.ok || !corpo.leitura) throw new Error(corpo.erro ?? `Falha ao analisar (${r.status}).`)
      onLeitura(corpo.leitura)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao analisar as fotos.')
    } finally {
      setEnviando(false)
    }
  }

  function criarRetangulo() {
    const w = numero(largura)
    const h = numero(profundidade)
    if (!(w > 0.3 && h > 0.3)) return setErro('Informe largura e profundidade em metros.')
    onRetangulo(nome.trim() || 'Cômodo', Math.round(w * 100), Math.round(h * 100))
  }

  const campo = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-stone-600 dark:bg-stone-800'

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={enviando ? undefined : onFechar}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Novo cômodo</h2>
          <button className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800">
          {(['fotos', 'manual'] as const).map((m) => (
            <button
              key={m}
              className={`rounded-md py-1.5 ${modo === m ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`}
              onClick={() => setModo(m)}
            >
              {m === 'fotos' ? 'Por fotos (IA)' : 'Desenhar retângulo'}
            </button>
          ))}
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Nome</span>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Sala, Quarto 1 (a IA sugere se ficar vazio)" />
        </label>

        {modo === 'manual' ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Largura (m)</span>
                <input className={campo} inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Profundidade (m)</span>
                <input className={campo} inputMode="decimal" value={profundidade} onChange={(e) => setProfundidade(e.target.value)} />
              </label>
            </div>
            {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 font-medium text-white dark:bg-orange-600" onClick={criarRetangulo}>
              <Square size={18} /> Criar cômodo
            </button>
          </>
        ) : (
          <>
            <div className="mb-1 text-sm font-medium">Fotos ({fotos.length}/10)</div>
            <p className="mb-2 text-xs text-stone-500">Fotografe de um canto, mostrando duas paredes e o teto. Gire até cobrir todas as paredes; 4 a 8 fotos costumam bastar.</p>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {fotos.map((f) => (
                <div key={f.id} className="relative aspect-square overflow-hidden rounded-lg bg-stone-200">
                  <img src={f.previa} alt="" className="h-full w-full object-cover" />
                  <button
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                    onClick={() => setFotos((l) => l.filter((x) => x.id !== f.id))}
                    aria-label="Remover foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {fotos.length < 10 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-xs text-stone-500 hover:border-orange-500 dark:border-stone-600">
                  <Camera size={22} />
                  Adicionar
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (adicionarFotos(e.target.files), (e.target.value = ''))} />
                </label>
              )}
            </div>

            <div className="mb-1 text-sm font-medium">Medidas reais (cm)</div>
            <p className="mb-2 text-xs text-stone-500">Pelo menos uma. É ela que dá a escala: quanto mais medidas, mais precisa a planta. Use a trena ou o botão da régua para medir com a câmera.</p>
            <div className="mb-2 space-y-2">
              {medidas.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={campo}
                    placeholder="O que mediu (ex.: parede da janela)"
                    value={m.descricao}
                    onChange={(e) => setMedidas((l) => l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                  />
                  <input
                    className={`${campo} w-24 shrink-0`}
                    placeholder="cm"
                    inputMode="decimal"
                    value={m.valor}
                    onChange={(e) => setMedidas((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  />
                  <button className="shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-orange-600 dark:hover:bg-stone-800" onClick={() => setMedindo(i)} aria-label="Medir com a câmera" title="Medir com a câmera">
                    <Ruler size={18} />
                  </button>
                  {medidas.length > 1 && (
                    <button className="shrink-0 p-2 text-stone-400 hover:text-red-600" onClick={() => setMedidas((l) => l.filter((_, j) => j !== i))} aria-label="Remover medida">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="mb-4 flex items-center gap-1 text-sm text-orange-600" onClick={() => setMedidas((l) => [...l, { descricao: '', valor: '' }])}>
              <Plus size={16} /> Outra medida
            </button>

            <div className="mb-3 grid grid-cols-[9rem_1fr] gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Pé-direito (cm)</span>
                <span className="flex gap-1">
                  <input className={campo} inputMode="decimal" placeholder="opcional" value={peDireito} onChange={(e) => setPeDireito(e.target.value)} />
                  <button type="button" className="shrink-0 rounded-lg p-2 text-stone-500 hover:text-orange-600" onClick={() => setMedindo('pd')} aria-label="Medir pé-direito com a câmera">
                    <Ruler size={18} />
                  </button>
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Observação</span>
                <input className={campo} placeholder="opcional (ex.: a parede do fundo é torta)" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </label>
            </div>

            {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 font-medium text-white disabled:opacity-60 dark:bg-orange-600"
              onClick={gerar}
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Analisando as fotos (até 1–2 min)…
                </>
              ) : (
                'Gerar planta'
              )}
            </button>
          </>
        )}
      </div>
      {medindo !== null && (
        // o clique dentro do medidor não pode chegar no fundo deste diálogo (que fecharia tudo)
        <div onClick={(e) => e.stopPropagation()}>
        <Medidor
          titulo={medindo === 'pd' ? 'Medir o pé-direito' : 'Medir com a câmera'}
          onFechar={() => setMedindo(null)}
          onUsar={(cm) => {
            const valor = cm.toFixed(1).replace('.0', '').replace('.', ',')
            if (medindo === 'pd') setPeDireito(valor)
            else setMedidas((l) => l.map((x, j) => (j === medindo ? { ...x, valor } : x)))
            setMedindo(null)
          }}
        />
        </div>
      )}
    </div>
  )
}
