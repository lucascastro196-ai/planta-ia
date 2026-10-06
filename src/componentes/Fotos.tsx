import { useEffect, useState } from 'react'
import { Download, ImageOff, Trash2, X } from 'lucide-react'
import { corDaMedida, formatarCm } from '@/lib/anotar'
import { baixar } from '@/lib/armazenamento'
import { apagarImagem, lerImagem } from '@/lib/fotosDb'
import type { FotoMedida, Projeto } from '@/lib/tipos'

interface Props {
  projeto: Projeto
  /** só as fotos deste cômodo */
  comodoId?: string
  onAlterar: (fotos: FotoMedida[]) => void
  onFechar: () => void
}

function Miniatura({ id, titulo }: { id: string; titulo: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    let u: string | null = null
    lerImagem(id)
      .then((b) => {
        if (!b) return setFalhou(true)
        u = URL.createObjectURL(b)
        setUrl(u)
      })
      .catch(() => setFalhou(true))
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  if (falhou)
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-lg bg-stone-100 text-xs text-stone-500 dark:bg-stone-800">
        <ImageOff size={20} /> Imagem não está neste aparelho
      </div>
    )
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={titulo} className="w-full rounded-lg border border-stone-200 dark:border-stone-700" />
    </a>
  ) : (
    <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
  )
}

export function Fotos({ projeto, comodoId, onAlterar, onFechar }: Props) {
  const todas = projeto.fotos ?? []
  const lista = comodoId ? todas.filter((f) => f.comodoId === comodoId) : todas
  const mudar = (id: string, f: Partial<FotoMedida>) => onAlterar(todas.map((x) => (x.id === id ? { ...x, ...f } : x)))

  const excluir = async (foto: FotoMedida) => {
    if (!confirm(`Excluir a foto "${foto.titulo}"?`)) return
    onAlterar(todas.filter((x) => x.id !== foto.id))
    await apagarImagem(foto.id).catch(() => {})
  }

  const baixarFoto = async (foto: FotoMedida) => {
    const b = await lerImagem(foto.id)
    if (b) baixar(b, `${foto.titulo.replace(/[^\w-]+/g, '-') || 'foto'}.jpg`)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onFechar}>
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fotos com medidas {lista.length > 0 && <span className="text-stone-400">({lista.length})</span>}</h2>
          <button className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {lista.length === 0 ? (
          <p className="rounded-lg bg-stone-100 p-4 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            Nenhuma foto anexada ainda. Em <b>Medir → Medir na foto</b>, grave as medidas e toque em <b>Anexar foto com medidas ao projeto</b>.
          </p>
        ) : (
          <div className="space-y-6">
            {lista.map((f) => (
              <div key={f.id} className="space-y-2">
                <Miniatura id={f.id} titulo={f.titulo} />
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-stone-300 focus:border-orange-500 focus:outline-none"
                    value={f.titulo}
                    onChange={(e) => mudar(f.id, { titulo: e.target.value })}
                    aria-label="Título da foto"
                  />
                  <button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => baixarFoto(f)} title="Baixar imagem" aria-label="Baixar imagem">
                    <Download size={16} />
                  </button>
                  <button className="rounded-md p-1.5 text-stone-400 hover:text-red-600" onClick={() => excluir(f)} title="Excluir" aria-label="Excluir foto">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span>{new Date(f.criadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span>·</span>
                  <span>Referência: {f.referencia}</span>
                  <span>·</span>
                  <select
                    className="rounded-md border border-stone-300 bg-white px-1 py-0.5 dark:border-stone-600 dark:bg-stone-800"
                    value={f.comodoId ?? ''}
                    onChange={(e) => mudar(f.id, { comodoId: e.target.value || undefined })}
                    aria-label="Cômodo da foto"
                  >
                    <option value="">Sem cômodo</option>
                    {projeto.comodos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <ul className="space-y-1 text-sm">
                  {f.medidas.map((m, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: corDaMedida(i) }}>
                        {i + 1}
                      </span>
                      <span className="flex-1">{m.nome}</span>
                      <span className="font-semibold tabular-nums">{formatarCm(m.cm)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
