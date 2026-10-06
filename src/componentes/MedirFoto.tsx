import { useContext, useEffect, useRef, useState } from 'react'
import { Camera, Check, Download, Info, Maximize, Minus, Paperclip, Pencil, Plus, RotateCw, ScanSearch, Square, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { AnexarFoto } from '@/lib/anexos'
import { corDaMedida, descreverMedida, formatarCm, gerarFotoAnotada } from '@/lib/anotar'
import { baixar } from '@/lib/armazenamento'
import { detectarFolha, detectarQuinas, prepararImagem } from '@/lib/detectar'
import { homografiaDaReferencia, inversaDaReferencia, REFERENCIAS, type Referencia } from '@/lib/homografia'
import { novoId, type Ponto } from '@/lib/tipos'
import {
  aplicarComprimento,
  centroDoTraco,
  formatarArea,
  medirTraco,
  reaplicarTravas,
  remapearTravas,
  restringirPonto,
  segmentos,
  transladarLado,
  type Traco,
} from '@/lib/traco'

interface Props {
  /** com valor: mostra o botão "Usar" nas linhas */
  onUsar?: (cm: number) => void
  /** cômodo ao qual a foto anexada fica ligada */
  comodoId?: string
  /** título sugerido para a foto anexada */
  tituloPadrao?: string
  /** foto de uma parede (nome dela): pede a foto, acha folha e quinas, e "Usar" já anexa a foto */
  paraParede?: string
}

interface Foto {
  url: string
  w: number
  h: number
}

/** Molde da referência na foto: centro, escala (px da foto por cm) e giro. */
interface Molde {
  cx: number
  cy: number
  s: number
  ang: number
}

type Gravada = Traco & { id: string; nome: string }
/** de quem é o ponto: do traço em edição ou de uma medida gravada */
type Dono = 'ativo' | string

type Arrasto =
  | { tipo: 'canto'; i: number }
  | { tipo: 'mover'; inicio: Ponto; molde: Molde }
  | { tipo: 'livre'; i: number }
  | { tipo: 'vertice'; dono: Dono; i: number }
  | { tipo: 'lado'; dono: Dono; seg: [number, number]; inicio: Ponto; pts0: Ponto[] }
  | { tipo: 'pan'; tela: Ponto; centro: Ponto }
  | { tipo: 'pinca'; dist: number; zoom: number }

const numero = (s: string) => Number(s.replace(',', '.'))
/** raio das alças em pixels de tela, qualquer que seja o tamanho da foto */
const RAIO_TELA = 11
const ZOOM_MAX = 12
const COR_ATIVO = '#f97316'

/** Parte da foto que aparece com o zoom, sem sair das bordas. */
function vistaDe(foto: Foto, zoom: number, centro: Ponto) {
  const w = foto.w / zoom
  const h = foto.h / zoom
  return {
    x: Math.min(Math.max(centro.x - w / 2, 0), foto.w - w),
    y: Math.min(Math.max(centro.y - h / 2, 0), foto.h - h),
    w,
    h,
  }
}

/** Cantos locais (em cm) na ordem: cima-esq, cima-dir, baixo-dir, baixo-esq. */
const cantosLocais = (w: number, h: number): Ponto[] => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
]

function cantosDoMolde(m: Molde, w: number, h: number): Ponto[] {
  const c = Math.cos(m.ang)
  const s = Math.sin(m.ang)
  return cantosLocais(w, h).map((p) => ({ x: m.cx + (p.x * c - p.y * s) * m.s, y: m.cy + (p.x * s + p.y * c) * m.s }))
}

export function MedirFoto({ onUsar, comodoId, tituloPadrao, paraParede }: Props) {
  const anexar = useContext(AnexarFoto)
  const [deteccao, setDeteccao] = useState<'procurando' | 'achou' | 'sem-folha' | null>(null)
  const [foto, setFoto] = useState<Foto | null>(null)
  const [ref, setRef] = useState<Referencia>('a4')
  const [refW, setRefW] = useState('60')
  const [refH, setRefH] = useState('60')
  const [molde, setMolde] = useState<Molde>({ cx: 0, cy: 0, s: 1, ang: 0 })
  /** cantos soltos (foto de lado); null = molde travado no formato */
  const [livres, setLivres] = useState<Ponto[] | null>(null)
  const [ativo, setAtivo] = useState<Traco | null>(null)
  const [gravadas, setGravadas] = useState<Gravada[]>([])
  /** ponto escolhido (para remover) */
  const [sel, setSel] = useState<{ dono: Dono; i: number } | null>(null)
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [unidadePorPx, setUnidadePorPx] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [centro, setCentro] = useState<Ponto>({ x: 0, y: 0 })
  const toques = useRef(new Map<number, Ponto>())
  const [nomeNova, setNomeNova] = useState('')
  const [titulo, setTitulo] = useState(tituloPadrao ?? '')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const dims = ref === 'azulejo' ? { largura: numero(refW) || 1, altura: numero(refH) || 1 } : REFERENCIAS[ref]

  // tamanho das alças acompanha o tamanho da foto na tela
  useEffect(() => {
    const el = svgRef.current
    if (!el || !foto) return
    const atualizar = () => setUnidadePorPx(foto.w / zoom / Math.max(1, el.getBoundingClientRect().width))
    atualizar()
    const obs = new ResizeObserver(atualizar)
    obs.observe(el)
    return () => obs.disconnect()
  }, [foto, zoom])

  // roda do mouse: zoom no ponto do cursor
  useEffect(() => {
    const el = svgRef.current
    if (!el || !foto) return
    const roda = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const fx = (e.clientX - r.left) / r.width
      const fy = (e.clientY - r.top) / r.height
      setZoom((z) => {
        const novo = Math.min(ZOOM_MAX, Math.max(1, z * Math.exp(-e.deltaY * 0.002)))
        setCentro((c) => {
          const v = vistaDe(foto, z, c)
          const px = v.x + fx * v.w
          const py = v.y + fy * v.h
          // mantém o ponto sob o cursor no mesmo lugar
          return { x: px + (0.5 - fx) * (foto.w / novo), y: py + (0.5 - fy) * (foto.h / novo) }
        })
        return novo
      })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [foto])

  /** linha ou forma nova, no meio do que está na tela */
  const novoTraco = (fechada: boolean, f: Foto = foto!, z = zoom, c = centro): Traco => {
    const v = vistaDe(f, z, c)
    if (!fechada)
      return {
        fechada,
        pts: [
          { x: v.x + v.w * 0.2, y: v.y + v.h * 0.75 },
          { x: v.x + v.w * 0.8, y: v.y + v.h * 0.75 },
        ],
      }
    const lado = Math.min(v.w, v.h) * 0.35
    const cx = v.x + v.w / 2
    const cy = v.y + v.h / 2
    return {
      fechada,
      pts: [
        { x: cx - lado / 2, y: cy - lado / 2 },
        { x: cx + lado / 2, y: cy - lado / 2 },
        { x: cx + lado / 2, y: cy + lado / 2 },
        { x: cx - lado / 2, y: cy + lado / 2 },
      ],
    }
  }

  async function abrir(arquivo: File | undefined) {
    if (!arquivo) return
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.src = url
    await img.decode()
    const { naturalWidth: w, naturalHeight: h } = img
    const f = { url, w, h }
    setFoto(f)
    setZoom(1)
    setCentro({ x: w / 2, y: h / 2 })
    // molde começa no meio, ocupando ~30% da altura da foto
    setMolde({ cx: w / 2, cy: h * 0.42, s: (h * 0.3) / Math.max(dims.largura, dims.altura), ang: 0 })
    setLivres(null)
    setGravadas([])
    setSel(null)
    setAviso(null)
    setAtivo(novoTraco(false, f, 1, { x: w / 2, y: h / 2 }))
    setDeteccao('procurando')
    // procura a folha (e, para uma parede, as quinas) sem travar a tela
    await new Promise((r) => setTimeout(r, 30))
    try {
      const im = prepararImagem(img, w, h)
      const folha = detectarFolha(im, Math.max(dims.largura, dims.altura) / Math.min(dims.largura, dims.altura))
      if (!folha) return setDeteccao('sem-folha')
      setLivres(folha)
      if (paraParede) {
        const [a, b] = detectarQuinas(im, folha)
        setAtivo({ fechada: false, pts: [a, b] })
        setNomeNova(paraParede)
      }
      setDeteccao('achou')
    } catch {
      setDeteccao('sem-folha')
    }
  }

  // aberto pelo botão de foto da parede: já pede a foto
  const entrada = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (paraParede) entrada.current?.click()
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** "Usar na parede": grava a linha com o nome da parede, anexa a foto anotada e manda a medida */
  async function usarNaParede() {
    if (!ativo || !medidaAtiva || !onUsar) return
    const g: Gravada = { ...ativo, id: novoId(), nome: nomeNova.trim() || paraParede || 'Parede' }
    const todas = [...gravadas, g]
    setGravadas(todas)
    if (anexar && foto) {
      setSalvando(true)
      try {
        const medidas = todas.flatMap((x) => {
          const m = medirTraco(H, x)
          return m ? [{ ...x, ...m }] : []
        })
        await anexar({
          blob: await gerarFotoAnotada({ url: foto.url, w: foto.w, h: foto.h, titulo: titulo.trim() || g.nome, referencia: referenciaNome, cantos, medidas }),
          titulo: titulo.trim() || g.nome,
          referencia: referenciaNome,
          medidas: medidas.map((m) => ({ nome: m.nome, cm: m.total, ...(m.fechada ? { area: m.area, lados: m.lados } : {}) })),
          comodoId,
        })
      } finally {
        setSalvando(false)
      }
    }
    onUsar(medidaAtiva.total)
  }

  const cantos = livres ?? cantosDoMolde(molde, dims.largura, dims.altura)
  const H = homografiaDaReferencia(cantos, dims.largura, dims.altura)
  const Hinv = inversaDaReferencia(cantos, dims.largura, dims.altura)
  const chaveReferencia = cantos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';') + `|${dims.largura}x${dims.altura}`
  const arrastando = arrasto !== null

  // se a referência mudar, as medidas digitadas continuam valendo: os pontos se ajustam
  useEffect(() => {
    if (!H || !Hinv || arrastando) return
    setAtivo((t) => (t?.travados ? reaplicarTravas(t, H, Hinv) : t))
    setGravadas((l) => (l.some((g) => g.travados) ? l.map((g) => ({ ...g, ...reaplicarTravas(g, H, Hinv) })) : l))
    // H e Hinv mudam junto com a chave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveReferencia, arrastando])
  const medidaAtiva = ativo ? medirTraco(H, ativo) : null
  const referenciaNome =
    ref === 'azulejo'
      ? `peça de ${refW} × ${refH} cm`
      : `${REFERENCIAS[ref].nome}, ${String(dims.largura).replace('.', ',')} × ${String(dims.altura).replace('.', ',')} cm`

  const mudarTraco = (dono: Dono, f: (t: Traco) => Traco) => {
    if (dono === 'ativo') setAtivo((t) => (t ? f(t) : t))
    else setGravadas((l) => l.map((g) => (g.id === dono ? { ...g, ...f(g) } : g)))
  }
  const tracoDe = (dono: Dono): Traco | undefined => (dono === 'ativo' ? (ativo ?? undefined) : gravadas.find((g) => g.id === dono))

  const gravar = () => {
    if (!ativo || !medidaAtiva || !foto) return
    const padrao = ativo.fechada ? `Forma ${gravadas.length + 1}` : `Medida ${gravadas.length + 1}`
    setGravadas((l) => [...l, { ...ativo, id: novoId(), nome: nomeNova.trim() || padrao }])
    setNomeNova('')
    setSel(null)
    setAviso(null)
    setAtivo(novoTraco(ativo.fechada))
  }

  const refazer = (g: Gravada) => {
    setGravadas((l) => l.filter((x) => x.id !== g.id))
    setAtivo({ pts: g.pts, fechada: g.fechada, travados: g.travados })
    setNomeNova(g.nome)
    setSel(null)
  }

  const removerPonto = () => {
    if (!sel) return
    const t = tracoDe(sel.dono)
    if (!t || t.pts.length <= (t.fechada ? 3 : 2)) return
    mudarTraco(sel.dono, (x) => {
      const depois = { ...x, pts: x.pts.filter((_, i) => i !== sel.i) }
      return { ...depois, travados: remapearTravas(x, depois, (j) => (j === sel.i ? null : j > sel.i ? j - 1 : j)) }
    })
    setSel(null)
  }

  /** toque no valor de um lado: digitar a medida real trava o lado; apagar destrava */
  const digitarLado = (dono: Dono, s: number) => {
    const t = tracoDe(dono)
    if (!t || !H || !Hinv) return
    const atual = t.travados?.[s] ?? medirTraco(H, t)?.lados[s]
    const resp = window.prompt('Medida real deste lado, em cm (deixe vazio para destravar):', atual !== undefined ? String(atual).replace('.', ',') : '')
    if (resp === null) return
    const cm = numero(resp.trim())
    mudarTraco(dono, (x) => {
      const travados = { ...(x.travados ?? {}) }
      if (!resp.trim() || !(cm > 0)) {
        delete travados[s]
        return { ...x, travados: Object.keys(travados).length ? travados : undefined }
      }
      travados[s] = cm
      return { ...x, travados, pts: aplicarComprimento(x, s, cm, H, Hinv) }
    })
  }

  const desenhadas = () =>
    gravadas.flatMap((g) => {
      const m = medirTraco(H, g)
      return m ? [{ ...g, ...m }] : []
    })

  const imagemAnotada = () =>
    gerarFotoAnotada({
      url: foto!.url,
      w: foto!.w,
      h: foto!.h,
      titulo: titulo.trim() || 'Medidas na foto',
      referencia: referenciaNome,
      cantos,
      medidas: desenhadas(),
    })

  async function anexarAoProjeto() {
    if (!anexar || gravadas.length === 0) return
    setSalvando(true)
    setAviso(null)
    try {
      await anexar({
        blob: await imagemAnotada(),
        titulo: titulo.trim() || 'Medidas na foto',
        referencia: referenciaNome,
        medidas: desenhadas().map((m) => ({ nome: m.nome, cm: m.total, ...(m.fechada ? { area: m.area, lados: m.lados } : {}) })),
        comodoId,
      })
      setAviso('Foto com as medidas anexada ao projeto. Veja em Fotos e no PDF.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não consegui anexar a foto.')
    } finally {
      setSalvando(false)
    }
  }

  async function baixarImagem() {
    if (gravadas.length === 0) return
    baixar(await imagemAnotada(), `${(titulo.trim() || 'medidas').replace(/[^\w-]+/g, '-')}.jpg`)
  }

  const naFoto = (e: React.PointerEvent): Ponto => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: Math.min(Math.max(p.x, 0), foto!.w), y: Math.min(Math.max(p.y, 0), foto!.h) }
  }

  const capturar = (e: React.PointerEvent) => {
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // ponteiro que já saiu: segue sem captura
    }
  }

  const comecar = (e: React.PointerEvent, a: Arrasto) => {
    e.stopPropagation()
    capturar(e)
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setArrasto(a)
  }

  /** "+" no meio de um lado: cria um ponto ali e já começa a arrastar (faz o "dente") */
  const inserirPonto = (e: React.PointerEvent, dono: Dono, a: number, b: number) => {
    const t = tracoDe(dono)
    if (!t) return
    const meio = { x: (t.pts[a]!.x + t.pts[b]!.x) / 2, y: (t.pts[a]!.y + t.pts[b]!.y) / 2 }
    const pos = b === 0 ? t.pts.length : b
    mudarTraco(dono, (x) => {
      const depois = { ...x, pts: [...x.pts.slice(0, pos), meio, ...x.pts.slice(pos)] }
      return { ...depois, travados: remapearTravas(x, depois, (j) => (j >= pos ? j + 1 : j)) }
    })
    setSel({ dono, i: pos })
    comecar(e, { tipo: 'vertice', dono, i: pos })
  }

  /** toque na foto (fora das alças): um dedo arrasta a vista, dois dedos dão zoom */
  const tocarFundo = (e: React.PointerEvent) => {
    capturar(e)
    setSel(null)
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (toques.current.size === 2) {
      const [a, b] = [...toques.current.values()] as [Ponto, Ponto]
      setArrasto({ tipo: 'pinca', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom })
    } else if (toques.current.size === 1) setArrasto({ tipo: 'pan', tela: { x: e.clientX, y: e.clientY }, centro })
  }

  const soltar = (e: React.PointerEvent) => {
    toques.current.delete(e.pointerId)
    if (toques.current.size === 0) setArrasto(null)
  }

  const mover = (e: React.PointerEvent) => {
    if (toques.current.has(e.pointerId)) toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!arrasto) return
    if (arrasto.tipo === 'pinca') {
      if (toques.current.size < 2) return
      const [a, b] = [...toques.current.values()] as [Ponto, Ponto]
      return setZoom(Math.min(ZOOM_MAX, Math.max(1, (arrasto.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, arrasto.dist))))
    }
    if (arrasto.tipo === 'pan') {
      return setCentro({
        x: arrasto.centro.x - (e.clientX - arrasto.tela.x) * unidadePorPx,
        y: arrasto.centro.y - (e.clientY - arrasto.tela.y) * unidadePorPx,
      })
    }
    const p = naFoto(e)
    if (arrasto.tipo === 'vertice')
      return mudarTraco(arrasto.dono, (t) => {
        const q = H && Hinv ? restringirPonto(t, arrasto.i, p, H, Hinv) : p
        return { ...t, pts: t.pts.map((x, i) => (i === arrasto.i ? q : x)) }
      })
    if (arrasto.tipo === 'lado') {
      if (!H || !Hinv) return
      const R = H(p)
      const delta = { x: R.x - arrasto.inicio.x, y: R.y - arrasto.inicio.y }
      return mudarTraco(arrasto.dono, (t) => ({ ...t, pts: transladarLado(arrasto.pts0, arrasto.seg, delta, H, Hinv) }))
    }
    if (arrasto.tipo === 'livre') return setLivres((l) => l && l.map((q, i) => (i === arrasto.i ? p : q)))
    if (arrasto.tipo === 'mover') {
      const m = arrasto.molde
      return setMolde({ ...m, cx: m.cx + p.x - arrasto.inicio.x, cy: m.cy + p.y - arrasto.inicio.y })
    }
    // canto do molde: o canto segue o dedo, girando e mudando a escala em volta do centro
    setMolde((m) => {
      const local = cantosLocais(dims.largura, dims.altura)[arrasto.i]!
      const dx = p.x - m.cx
      const dy = p.y - m.cy
      const s = Math.max(0.05, Math.hypot(dx, dy) / Math.hypot(local.x, local.y))
      return { ...m, s, ang: Math.atan2(dy, dx) - Math.atan2(local.y, local.x) }
    })
  }

  if (!foto) {
    return (
      <div className="space-y-4 p-1 text-sm">
        <div className="flex gap-2 rounded-lg bg-stone-100 p-3 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            Encoste uma folha A4 (ou um cartão) na parede que vai medir e fotografe a parede inteira, o mais de frente possível. Depois encaixe o molde azul em
            cima da folha e meça com linhas ou formas.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-10 text-stone-500 hover:border-orange-500 dark:border-stone-600">
          <Camera size={28} />
          Tirar ou escolher foto
          <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
        </label>
      </div>
    )
  }

  const vista = vistaDe(foto, zoom, centro)
  const ajustarAFolha = () => {
    const xs = cantos.map((p) => p.x)
    const ys = cantos.map((p) => p.y)
    const larg = Math.max(...xs) - Math.min(...xs)
    const alt = Math.max(...ys) - Math.min(...ys)
    // a folha ocupa ~60% da vista
    setZoom(Math.min(ZOOM_MAX, Math.max(1, Math.min((foto.w * 0.6) / Math.max(1, larg), (foto.h * 0.6) / Math.max(1, alt)))))
    setCentro({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 })
  }
  const raio = RAIO_TELA * unidadePorPx
  const traco = 2 * unidadePorPx
  const letra = 12 * unidadePorPx
  const alvo = !arrasto
    ? null
    : arrasto.tipo === 'vertice'
      ? (tracoDe(arrasto.dono)?.pts[arrasto.i] ?? null)
      : arrasto.tipo === 'canto' || arrasto.tipo === 'livre'
        ? cantos[arrasto.i]
        : null
  const lupa = 40 * unidadePorPx
  const botao = 'rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800'
  const tracoSel = sel ? tracoDe(sel.dono) : undefined
  const podeRemover = !!tracoSel && tracoSel.pts.length > (tracoSel.fechada ? 3 : 2)

  /** etiqueta de texto com fundo branco, em unidades da foto */
  const Etiqueta = ({ c, texto, cor, tam = letra, escura = false }: { c: Ponto; texto: string; cor: string; tam?: number; escura?: boolean }) => {
    const larg = tam * 0.62 * texto.length + tam * 0.9
    return (
      <g>
        <rect
          x={c.x - larg / 2}
          y={c.y - tam * 0.75}
          width={larg}
          height={tam * 1.5}
          rx={tam * 0.75}
          fill={escura ? '#1c1917' : '#fff'}
          stroke={cor}
          strokeWidth={traco * 0.8}
        />
        <text x={c.x} y={c.y} dy="0.35em" fontSize={tam} fontWeight={700} fill={escura ? '#fff' : '#1c1917'} textAnchor="middle" pointerEvents="none">
          {texto}
        </text>
      </g>
    )
  }

  /** desenha uma linha ou forma, com valor em cada lado, "+" para criar pontos e alças nos pontos */
  const desenharTraco = (t: Traco, dono: Dono, cor: string, n?: number) => {
    const m = medirTraco(H, t)
    const segs = segmentos(t)
    const c = centroDoTraco(t)
    const emEdicao = dono === 'ativo'
    const caminho = t.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (t.fechada ? ' Z' : '')
    return (
      <g key={dono}>
        {t.fechada && <path d={caminho} fill={cor} fillOpacity={0.15} pointerEvents="none" />}
        <path d={caminho} fill="none" stroke="#fff" strokeWidth={traco * 3} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
        <path
          d={caminho}
          fill="none"
          stroke={cor}
          strokeWidth={traco * 1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={emEdicao ? `${traco * 4} ${traco * 3}` : undefined}
          pointerEvents="none"
        />
        {segs.map(([a, b], s) => {
          const p = t.pts[a]!
          const q = t.pts[b]!
          const meio = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
          // valor fora da forma (ou acima da linha), "+" no meio do lado
          let nx = -(q.y - p.y)
          let ny = q.x - p.x
          const len = Math.hypot(nx, ny) || 1
          nx /= len
          ny /= len
          if (t.fechada ? nx * (meio.x - c.x) + ny * (meio.y - c.y) < 0 : ny > 0) (nx = -nx), (ny = -ny)
          const rotulo = { x: meio.x + nx * letra * 1.5, y: meio.y + ny * letra * 1.5 }
          const travado = t.travados?.[s]
          return (
            <g key={s}>
              {m && (
                // toque no valor: digitar a medida real
                <g onPointerDown={(e) => e.stopPropagation()} onClick={() => digitarLado(dono, s)} style={{ cursor: 'text' }}>
                  <Etiqueta
                    c={rotulo}
                    texto={`${travado !== undefined ? '🔒 ' : ''}${(travado ?? m.lados[s] ?? 0).toFixed(1).replace('.', ',')}`}
                    cor={cor}
                    escura={travado !== undefined}
                  />
                </g>
              )}
              {travado !== undefined ? (
                // lado travado: o meio vira alça para mover o lado inteiro, sem mudar a medida
                <g onPointerDown={(e) => H && comecar(e, { tipo: 'lado', dono, seg: [a, b], inicio: H(naFoto(e)), pts0: t.pts })} style={{ cursor: 'move' }}>
                  <circle cx={meio.x} cy={meio.y} r={raio * 0.7} fill="#1c1917" stroke="#fff" strokeWidth={traco} />
                  <path
                    d={`M${meio.x - raio * 0.4} ${meio.y}H${meio.x + raio * 0.4}M${meio.x} ${meio.y - raio * 0.4}V${meio.y + raio * 0.4}`}
                    stroke="#fff"
                    strokeWidth={traco}
                    pointerEvents="none"
                  />
                </g>
              ) : (
                <g onPointerDown={(e) => inserirPonto(e, dono, a, b)} style={{ cursor: 'copy' }}>
                  <circle cx={meio.x} cy={meio.y} r={raio * 0.6} fill="#fff" stroke={cor} strokeWidth={traco} />
                  <path
                    d={`M${meio.x - raio * 0.32} ${meio.y}H${meio.x + raio * 0.32}M${meio.x} ${meio.y - raio * 0.32}V${meio.y + raio * 0.32}`}
                    stroke={cor}
                    strokeWidth={traco}
                    pointerEvents="none"
                  />
                </g>
              )}
            </g>
          )
        })}
        {t.pts.map((p, i) => {
          const escolhido = sel?.dono === dono && sel.i === i
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={emEdicao ? raio : raio * 0.8}
              fill={cor}
              fillOpacity={emEdicao ? 0.55 : 0.9}
              stroke={escolhido ? '#facc15' : '#fff'}
              strokeWidth={escolhido ? traco * 2.2 : traco}
              onPointerDown={(e) => {
                setSel({ dono, i })
                comecar(e, { tipo: 'vertice', dono, i })
              }}
            />
          )
        })}
        {n !== undefined && m && (
          <g pointerEvents="none">
            <circle cx={t.fechada ? c.x : (t.pts[0]!.x + t.pts.at(-1)!.x) / 2} cy={(t.fechada ? c.y : (t.pts[0]!.y + t.pts.at(-1)!.y) / 2) + (t.fechada ? 0 : letra * 3)} r={letra * 0.9} fill={cor} stroke="#fff" strokeWidth={traco} />
            <text
              x={t.fechada ? c.x : (t.pts[0]!.x + t.pts.at(-1)!.x) / 2}
              y={(t.fechada ? c.y : (t.pts[0]!.y + t.pts.at(-1)!.y) / 2) + (t.fechada ? 0 : letra * 3)}
              dy="0.35em"
              fontSize={letra}
              fontWeight={700}
              fill="#fff"
              textAnchor="middle"
            >
              {n}
            </text>
            {t.fechada && m.area !== undefined && <Etiqueta c={{ x: c.x, y: c.y + letra * 2 }} texto={formatarArea(m.area)} cor={cor} />}
          </g>
        )}
      </g>
    )
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>Referência:</span>
        <select
          className="rounded-md border border-stone-300 bg-white px-2 py-1 dark:border-stone-600 dark:bg-stone-800"
          value={ref}
          onChange={(e) => setRef(e.target.value as Referencia)}
        >
          {Object.entries(REFERENCIAS).map(([k, r]) => (
            <option key={k} value={k}>
              {r.nome}
            </option>
          ))}
        </select>
        {ref === 'azulejo' && (
          <span className="flex items-center gap-1">
            <input className="w-14 rounded-md border border-stone-300 px-1 py-1 text-right dark:border-stone-600 dark:bg-stone-800" inputMode="decimal" value={refW} onChange={(e) => setRefW(e.target.value)} />
            ×
            <input className="w-14 rounded-md border border-stone-300 px-1 py-1 text-right dark:border-stone-600 dark:bg-stone-800" inputMode="decimal" value={refH} onChange={(e) => setRefH(e.target.value)} />
            cm
          </span>
        )}
        <label className="ml-auto cursor-pointer text-orange-600">
          Outra foto
          <input type="file" accept="image/*" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
        </label>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
          className="block max-h-[60dvh] w-full touch-none select-none rounded-lg bg-black"
          style={{ aspectRatio: `${foto.w} / ${foto.h}` }}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <image href={foto.url} width={foto.w} height={foto.h} onPointerDown={tocarFundo} style={{ cursor: zoom > 1 ? 'grab' : 'default' }} />
          <polygon
            points={cantos.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(59,130,246,0.25)"
            stroke="#3b82f6"
            strokeWidth={traco}
            style={{ cursor: livres ? 'default' : 'move' }}
            onPointerDown={livres ? undefined : (e) => comecar(e, { tipo: 'mover', inicio: naFoto(e), molde })}
          />
          {cantos.map((p, i) => (
            <circle
              key={`r${i}`}
              cx={p.x}
              cy={p.y}
              r={raio}
              fill="rgba(59,130,246,0.5)"
              stroke="#fff"
              strokeWidth={traco}
              onPointerDown={(e) => comecar(e, livres ? { tipo: 'livre', i } : { tipo: 'canto', i })}
            />
          ))}
          {gravadas.map((g, i) => desenharTraco(g, g.id, corDaMedida(i), i + 1))}
          {ativo && desenharTraco(ativo, 'ativo', COR_ATIVO)}
        </svg>
        {alvo && (
          // lupa: o dedo cobre o ponto, então mostra ampliado no canto
          <svg
            viewBox={`${alvo.x - lupa} ${alvo.y - lupa} ${lupa * 2} ${lupa * 2}`}
            className="pointer-events-none absolute top-2 left-2 h-28 w-28 rounded-full border-2 border-white bg-black shadow-lg"
          >
            <image href={foto.url} width={foto.w} height={foto.h} />
            <line x1={alvo.x - lupa} y1={alvo.y} x2={alvo.x + lupa} y2={alvo.y} stroke="#fff" strokeWidth={traco / 2} />
            <line x1={alvo.x} y1={alvo.y - lupa} x2={alvo.x} y2={alvo.y + lupa} stroke="#fff" strokeWidth={traco / 2} />
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={botao} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} aria-label="Diminuir zoom" title="Diminuir zoom">
          <ZoomOut size={15} />
        </button>
        <span className="w-10 text-center text-xs tabular-nums text-stone-500">{zoom.toFixed(1).replace('.', ',')}×</span>
        <button className={botao} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.5))} aria-label="Aumentar zoom" title="Aumentar zoom">
          <ZoomIn size={15} />
        </button>
        <button className={`${botao} flex items-center gap-1`} onClick={ajustarAFolha}>
          <ScanSearch size={13} /> Ajustar à folha
        </button>
        <button className={`${botao} flex items-center gap-1`} onClick={() => (setZoom(1), setCentro({ x: foto.w / 2, y: foto.h / 2 }))}>
          <Maximize size={13} /> Foto inteira
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!livres && (
          <button className={`${botao} flex items-center gap-1`} onClick={() => setMolde((m) => ({ ...m, ang: m.ang + Math.PI / 2 }))}>
            <RotateCw size={13} /> Girar 90°
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
          <input type="checkbox" checked={livres !== null} onChange={(e) => setLivres(e.target.checked ? cantosDoMolde(molde, dims.largura, dims.altura) : null)} />
          Foto de lado: ajustar cada canto
        </label>
      </div>

      <p className="text-xs text-stone-500">
        {livres ? (
          <>Arraste cada canto azul para o canto da folha.</>
        ) : (
          <>
            <span className="font-medium text-blue-600">Molde azul</span>: arraste por dentro para mover; puxe um canto para aumentar, diminuir e girar.
          </>
        )}{' '}
        <span className="font-medium text-orange-600">Laranja</span>: o que você está medindo. Puxe o <b>+</b> no meio de um lado para criar um ponto (os
        "dentes"); toque num ponto e use <b>Remover ponto</b> para tirar. <b>Toque no valor de um lado para digitar a medida real</b> (ex.: pé-direito 300): o
        lado fica travado 🔒, gira pela ponta e anda pelo meio sem mudar a medida. Só vale na mesma parede da folha.
      </p>

      {deteccao && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            deteccao === 'achou'
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
              : deteccao === 'procurando'
                ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
          }`}
        >
          {deteccao === 'procurando'
            ? 'Procurando a folha na foto…'
            : deteccao === 'achou'
              ? paraParede
                ? 'Folha e quinas da parede encontradas automaticamente. Confira os cantos azuis e as pontas laranja (use o zoom) antes de usar.'
                : 'Folha encontrada automaticamente. Confira os cantos azuis com o zoom.'
              : 'Não achei a folha sozinho: encaixe o molde azul nela (arraste e puxe um canto).'}
        </p>
      )}

      {paraParede && onUsar && medidaAtiva && !ativo?.fechada && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 font-medium text-white disabled:opacity-60"
          onClick={usarNaParede}
          disabled={salvando}
        >
          <Check size={18} /> {salvando ? 'Anexando a foto…' : `Usar ${formatarCm(medidaAtiva.total)} na ${paraParede.toLowerCase()}`}
        </button>
      )}

      <div className="rounded-xl bg-stone-900 p-3 text-white">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-stone-800 p-1 text-sm">
          <button
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 ${ativo && !ativo.fechada ? 'bg-stone-600 font-medium' : 'text-stone-400'}`}
            onClick={() => (setAtivo(novoTraco(false)), setSel(null))}
          >
            <Minus size={15} /> Linha
          </button>
          <button
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 ${ativo?.fechada ? 'bg-stone-600 font-medium' : 'text-stone-400'}`}
            onClick={() => (setAtivo(novoTraco(true)), setSel(null))}
          >
            <Square size={14} /> Forma
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-2xl font-semibold tabular-nums">
              {!medidaAtiva ? '—' : ativo?.fechada && medidaAtiva.area !== undefined ? formatarArea(medidaAtiva.area) : formatarCm(medidaAtiva.total)}
            </span>
            {ativo?.fechada && medidaAtiva && <div className="text-xs text-stone-400">perímetro {formatarCm(medidaAtiva.total)}</div>}
          </div>
          <div className="flex gap-1">
            {podeRemover && (
              <button className="rounded-lg bg-stone-700 px-3 py-2 text-sm" onClick={removerPonto}>
                Remover ponto
              </button>
            )}
            {onUsar && medidaAtiva && !ativo?.fechada && !paraParede && (
              <button className="rounded-lg bg-stone-700 px-3 py-2 text-sm font-medium" onClick={() => onUsar(medidaAtiva.total)}>
                Usar
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 text-sm outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-orange-500"
            placeholder={ativo?.fechada ? 'Nome (ex.: nicho, bancada, janela)' : 'Nome (ex.: largura da parede)'}
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && gravar()}
          />
          <button className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium disabled:opacity-50" onClick={gravar} disabled={!medidaAtiva}>
            <Plus size={16} /> Gravar
          </button>
        </div>
      </div>

      {gravadas.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Medidas gravadas nesta foto</div>
          {gravadas.map((g, i) => {
            const m = medirTraco(H, g)
            return (
              <div key={g.id} className="rounded-lg border border-stone-200 px-2 py-1.5 dark:border-stone-700">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: corDaMedida(i) }}>
                    {i + 1}
                  </span>
                  <input
                    className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-300 focus:border-orange-500 focus:outline-none"
                    value={g.nome}
                    onChange={(e) => setGravadas((l) => l.map((x) => (x.id === g.id ? { ...x, nome: e.target.value } : x)))}
                    aria-label={`Nome da medida ${i + 1}`}
                  />
                  <span className="shrink-0 font-semibold tabular-nums">{!m ? '—' : g.fechada && m.area !== undefined ? formatarArea(m.area) : formatarCm(m.total)}</span>
                  {onUsar && m && !g.fechada && (
                    <button className="shrink-0 rounded-md px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => onUsar(m.total)}>
                      Usar
                    </button>
                  )}
                  <button className="shrink-0 p-1 text-stone-400 hover:text-stone-700" onClick={() => refazer(g)} aria-label="Refazer esta medida" title="Refazer">
                    <Pencil size={14} />
                  </button>
                  <button className="shrink-0 p-1 text-stone-400 hover:text-red-600" onClick={() => setGravadas((l) => l.filter((x) => x.id !== g.id))} aria-label="Excluir medida">
                    <Trash2 size={14} />
                  </button>
                </div>
                {g.fechada && m && <div className="mt-0.5 pl-8 text-xs text-stone-500">{descreverMedida({ cm: m.total, area: m.area, lados: m.lados })}</div>}
              </div>
            )
          })}

          <div className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Título da foto</span>
              <input
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-stone-600 dark:bg-stone-800"
                placeholder="Ex.: Sala — parede da TV"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {anexar && (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-orange-600"
                  onClick={anexarAoProjeto}
                  disabled={salvando}
                >
                  <Paperclip size={15} /> {salvando ? 'Anexando…' : 'Anexar foto com medidas ao projeto'}
                </button>
              )}
              <button className="flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600" onClick={baixarImagem}>
                <Download size={15} /> Baixar imagem
              </button>
            </div>
            {aviso && (
              <p className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <Check size={14} /> {aviso}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
