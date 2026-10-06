import { useEffect, useRef, useState } from 'react'
import { Download, FilePlus2, FolderOpen, Images, Maximize2, Plus, Ruler, Undo2 } from 'lucide-react'
import { Fotos } from './componentes/Fotos'
import { Medidor } from './componentes/Medidor'
import { AnexarFoto, type NovaFoto } from './lib/anexos'
import { blobParaDataUrl, dataUrlParaBlob, lerImagem, salvarImagem } from './lib/fotosDb'
import { NovoComodo } from './componentes/NovoComodo'
import { PainelComodo } from './componentes/PainelComodo'
import { Planta, type PlantaApi } from './componentes/Planta'
import { baixar, carregarProjeto, nomeArquivo, salvarProjeto } from './lib/armazenamento'
import { gerarDAE } from './lib/exportar/dae'
import { gerarDXF } from './lib/exportar/dxf'
import { limites } from './lib/geometria'
import { comodoDoContorno } from './lib/montar'
import { novoId, projetoVazio, type Comodo, type Ponto, type Projeto } from './lib/tipos'

/** Arquivo .planta.json: o projeto mais as imagens das fotos (em data URL), para abrir em outro aparelho. */
type ArquivoProjeto = Projeto & { imagens?: Record<string, string> }

const LIMITE_DESFAZER = 50

export default function App() {
  const [projeto, setProjeto] = useState<Projeto>(carregarProjeto)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [menu, setMenu] = useState(false)
  const [medir, setMedir] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  /** galeria aberta: 'todas' ou o id do cômodo */
  const [galeria, setGaleria] = useState<string | null>(null)
  const historico = useRef<Projeto[]>([])
  const plantaRef = useRef<PlantaApi>(null)
  const projetoRef = useRef(projeto)
  projetoRef.current = projeto

  useEffect(() => {
    const t = setTimeout(() => salvarProjeto(projeto), 300)
    return () => clearTimeout(t)
  }, [projeto])

  const registrar = () => {
    historico.current.push(projetoRef.current)
    if (historico.current.length > LIMITE_DESFAZER) historico.current.shift()
  }
  const alterar = (p: Projeto) => {
    registrar()
    setProjeto(p)
  }
  const desfazer = () => {
    const anterior = historico.current.pop()
    if (anterior) setProjeto(anterior)
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const emCampo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !emCampo) {
        e.preventDefault()
        desfazer()
      }
      if (e.key === 'Delete' && !emCampo && selecionado) {
        alterar({ ...projetoRef.current, comodos: projetoRef.current.comodos.filter((c) => c.id !== selecionado) })
        setSelecionado(null)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const posicaoLivre = (): Ponto => {
    if (projeto.comodos.length === 0) return { x: 0, y: 0 }
    const b = limites(projeto.comodos, projeto.espessuraParede)
    return { x: Math.round(b.maxX + 150), y: Math.round(b.minY + projeto.espessuraParede) }
  }

  const adicionar = (c: Comodo) => {
    alterar({ ...projeto, comodos: [...projeto.comodos, c] })
    setSelecionado(c.id)
    setNovo(false)
    setTimeout(() => plantaRef.current?.enquadrar(), 50)
  }

  const anexarFoto = async (f: NovaFoto) => {
    const id = novoId()
    await salvarImagem(id, f.blob)
    const p = projetoRef.current
    alterar({
      ...p,
      fotos: [...(p.fotos ?? []), { id, titulo: f.titulo, criadaEm: new Date().toISOString(), comodoId: f.comodoId, referencia: f.referencia, medidas: f.medidas }],
    })
  }

  /** imagens das fotos anexadas, na ordem do projeto (as que não estão neste aparelho ficam de fora) */
  const imagensDasFotos = async () => {
    const saida: { foto: NonNullable<Projeto['fotos']>[number]; dataUrl: string }[] = []
    for (const foto of projeto.fotos ?? []) {
      const b = await lerImagem(foto.id).catch(() => undefined)
      if (b) saida.push({ foto, dataUrl: await blobParaDataUrl(b) })
    }
    return saida
  }

  const exportar = async (tipo: 'pdf-a4' | 'pdf-a3' | 'dxf' | 'dae' | 'json') => {
    setMenu(false)
    if (projeto.comodos.length === 0 && tipo !== 'json' && !(tipo.startsWith('pdf') && projeto.fotos?.length))
      return setAviso('Adicione pelo menos um cômodo antes de exportar.')
    const nome = nomeArquivo(projeto)
    try {
      if (tipo === 'dxf') baixar(gerarDXF(projeto), `${nome}.dxf`, 'application/dxf')
      else if (tipo === 'dae') baixar(gerarDAE(projeto), `${nome}.dae`, 'model/vnd.collada+xml')
      else if (tipo === 'json') {
        const imagens = Object.fromEntries((await imagensDasFotos()).map((x) => [x.foto.id, x.dataUrl]))
        const arquivo: ArquivoProjeto = { ...projeto, imagens }
        baixar(JSON.stringify(arquivo), `${nome}.planta.json`, 'application/json')
      } else {
        setAviso('Gerando PDF…')
        const { gerarPDF } = await import('./lib/exportar/pdf')
        baixar(await gerarPDF(projeto, tipo === 'pdf-a4' ? 'A4' : 'A3', await imagensDasFotos()), `${nome}.pdf`, 'application/pdf')
        setAviso(null)
      }
    } catch (e) {
      setAviso(`Falha ao exportar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const abrir = (arquivo: File | undefined) => {
    if (!arquivo) return
    arquivo
      .text()
      .then(async (t) => {
        const { imagens, ...p } = JSON.parse(t) as ArquivoProjeto
        if (p.versao !== 1 || !Array.isArray(p.comodos)) throw new Error()
        for (const [id, url] of Object.entries(imagens ?? {})) await salvarImagem(id, await dataUrlParaBlob(url))
        alterar(p)
        setSelecionado(null)
        setTimeout(() => plantaRef.current?.enquadrar(), 50)
      })
      .catch(() => setAviso('Arquivo de projeto inválido.'))
  }

  const comodoSel = projeto.comodos.find((c) => c.id === selecionado)
  const botao = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800'

  return (
    <AnexarFoto.Provider value={anexarFoto}>
    <div className="flex h-dvh flex-col bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100">
      <header className="flex flex-wrap items-center gap-1 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
        <input
          className="mr-2 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 font-semibold outline-none hover:border-stone-300 focus:border-orange-500 sm:flex-none"
          value={projeto.nome}
          onChange={(e) => setProjeto({ ...projeto, nome: e.target.value })}
          aria-label="Nome do projeto"
        />
        <button className={`${botao} bg-stone-900 text-white hover:bg-stone-700 dark:bg-orange-600 dark:hover:bg-orange-500`} onClick={() => setNovo(true)}>
          <Plus size={16} /> Cômodo
        </button>
        <button className={botao} onClick={() => setMedir(true)} title="Medir com a câmera">
          <Ruler size={16} /> <span className="hidden sm:inline">Medir</span>
        </button>
        <button className={botao} onClick={() => setGaleria('todas')} title="Fotos com medidas">
          <Images size={16} /> <span className="hidden sm:inline">Fotos</span>
          {(projeto.fotos?.length ?? 0) > 0 && <span className="rounded-full bg-orange-600 px-1.5 text-xs text-white">{projeto.fotos!.length}</span>}
        </button>
        <button className={botao} onClick={() => plantaRef.current?.enquadrar()} title="Enquadrar a planta">
          <Maximize2 size={16} />
        </button>
        <button className={botao} onClick={desfazer} title="Desfazer (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <label className={`${botao} hidden sm:flex`} title="Espessura das paredes">
          Parede
          <input
            className="w-12 rounded-md border border-stone-300 bg-white px-1 py-0.5 text-right tabular-nums dark:border-stone-600 dark:bg-stone-800"
            type="number"
            min={5}
            max={60}
            value={projeto.espessuraParede}
            onChange={(e) => Number(e.target.value) >= 5 && alterar({ ...projeto, espessuraParede: Number(e.target.value) })}
          />
          cm
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            className={botao}
            title="Novo projeto"
            onClick={() => {
              if (projeto.comodos.length === 0 || confirm('Começar um projeto novo? O atual fica no Desfazer; salve-o antes em Exportar → Projeto.')) {
                alterar(projetoVazio())
                setSelecionado(null)
              }
            }}
          >
            <FilePlus2 size={16} />
          </button>
          <label className={`${botao} cursor-pointer`} title="Abrir projeto (.planta.json)">
            <FolderOpen size={16} />
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => (abrir(e.target.files?.[0]), (e.target.value = ''))} />
          </label>
          <div className="relative">
            <button className={botao} onClick={() => setMenu((m) => !m)}>
              <Download size={16} /> Exportar
            </button>
            {menu && (
              <div className="absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-800">
                {(
                  [
                    ['pdf-a4', 'PDF — folha A4', 'para imprimir, com escala e carimbo'],
                    ['pdf-a3', 'PDF — folha A3', 'mais espaço, escala maior'],
                    ['dxf', 'DXF', 'AutoCAD, BricsCAD, LibreCAD (metros)'],
                    ['dae', 'SketchUp (.dae)', 'modelo 3D: Arquivo → Importar'],
                    ['json', 'Projeto (.planta.json)', 'para abrir aqui de novo'],
                  ] as const
                ).map(([tipo, titulo, sub]) => (
                  <button key={tipo} className="block w-full px-4 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-700" onClick={() => exportar(tipo)}>
                    <div className="text-sm font-medium">{titulo}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">{sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1" onPointerDown={() => setMenu(false)}>
          <Planta
            ref={plantaRef}
            projeto={projeto}
            selecionado={selecionado}
            onSelecionar={setSelecionado}
            onInicioEdicao={registrar}
            onAlterar={setProjeto}
          />
          {projeto.comodos.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-sm rounded-2xl bg-white/95 p-6 text-center shadow-lg dark:bg-stone-800/95">
                <h1 className="mb-2 text-lg font-semibold">Planta baixa com medidas reais</h1>
                <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
                  Contorne o piso com a câmera ou informe as paredes uma a uma (medidas com trena, câmera ou foto). A planta sai com paredes, cotas, portas e
                  janelas. Repita para cada cômodo e encaixe-os arrastando. Tudo funciona no aparelho, sem custo.
                </p>
                <button className="rounded-xl bg-stone-900 px-5 py-2.5 font-medium text-white dark:bg-orange-600" onClick={() => setNovo(true)}>
                  Adicionar o primeiro cômodo
                </button>
              </div>
            </div>
          )}
          {aviso && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
              {aviso}
              <button className="text-stone-400 hover:text-white" onClick={() => setAviso(null)}>
                ok
              </button>
            </div>
          )}
        </div>
        {comodoSel && (
          <aside className="max-h-[50dvh] border-t border-stone-200 md:max-h-none md:w-80 md:border-t-0 md:border-l dark:border-stone-700">
            <PainelComodo
              comodo={comodoSel}
              onAlterar={(c) => alterar({ ...projeto, comodos: projeto.comodos.map((x) => (x.id === c.id ? c : x)) })}
              onExcluir={() => {
                alterar({ ...projeto, comodos: projeto.comodos.filter((x) => x.id !== comodoSel.id) })
                setSelecionado(null)
              }}
              onFechar={() => setSelecionado(null)}
              fotos={(projeto.fotos ?? []).filter((f) => f.comodoId === comodoSel.id).length}
              onVerFotos={() => setGaleria(comodoSel.id)}
            />
          </aside>
        )}
      </main>

      {medir && (
        <Medidor
          onFechar={() => setMedir(false)}
          onContorno={(pts) => {
            setMedir(false)
            adicionar(comodoDoContorno(`Cômodo ${projeto.comodos.length + 1}`, pts, posicaoLivre()))
          }}
        />
      )}
      {novo && (
        <NovoComodo
          posicao={posicaoLivre()}
          onFechar={() => setNovo(false)}
          onCriar={adicionar}
          onContornar={() => {
            setNovo(false)
            setMedir(true)
          }}
        />
      )}
      {galeria && (
        <Fotos
          projeto={projeto}
          comodoId={galeria === 'todas' ? undefined : galeria}
          onAlterar={(fotos) => alterar({ ...projeto, fotos })}
          onFechar={() => setGaleria(null)}
        />
      )}
    </div>
    </AnexarFoto.Provider>
  )
}
