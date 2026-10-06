import { useContext, useEffect, useRef, useState } from 'react'
import { Camera, Check, Download, Info, Maximize, Paperclip, Pencil, Plus, RotateCw, ScanSearch, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { AnexarFoto } from '@/lib/anexos'
import { corDaMedida, formatarCm, gerarFotoAnotada } from '@/lib/anotar'
import { baixar } from '@/lib/armazenamento'
import { homografiaDaReferencia, REFERENCIAS, type Referencia } from '@/lib/homografia'
import { novoId, type Ponto } from '@/lib/tipos'

interface Props {
  /** com valor: mostra o botão "Usar" */
  onUsar?: (cm: number) => void
  /** cômodo ao qual a foto anexada fica ligada */
  comodoId?: string
  /** título sugerido para a foto anexada */
  tituloPadrao?: string
}

interface Gravada {
  id: string
  nome: string
  a: Ponto
  b: Ponto
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

type Arrasto =
  | { tipo: 'canto'; i: number }
  | { tipo: 'mover'; inicio: Ponto; molde: Molde }
  | { tipo: 'livre'; i: number }
  | { tipo: 'medida'; i: number }
  | { tipo: 'gravada'; id: string; i: number }
  | { tipo: 'pan'; tela: Ponto; centro: Ponto }
  | { tipo: 'pinca'; dist: number; zoom: number }

const numero = (s: string) => Number(s.replace(',', '.'))
/** raio das alças em pixels de tela, qualquer que seja o tamanho da foto */
const RAIO_TELA = 11
const ZOOM_MAX = 12

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

export function MedirFoto({ onUsar, comodoId, tituloPadrao }: Props) {
  const anexar = useContext(AnexarFoto)
  const [foto, setFoto] = useState<Foto | null>(null)
  const [ref, setRef] = useState<Referencia>('a4')
  const [refW, setRefW] = useState('60')
  const [refH, setRefH] = useState('60')
  const [molde, setMolde] = useState<Molde>({ cx: 0, cy: 0, s: 1, ang: 0 })
  /** cantos soltos (foto de lado); null = molde travado no formato */
  const [livres, setLivres] = useState<Ponto[] | null>(null)
  const [medida, setMedida] = useState<Ponto[]>([])
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [unidadePorPx, setUnidadePorPx] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [centro, setCentro] = useState<Ponto>({ x: 0, y: 0 })
  const toques = useRef(new Map<number, Ponto>())
  const [gravadas, setGravadas] = useState<Gravada[]>([])
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

  async function abrir(arquivo: File | undefined) {
    if (!arquivo) return
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.src = url
    await img.decode()
    const { naturalWidth: w, naturalHeight: h } = img
    setFoto({ url, w, h })
    setZoom(1)
    setCentro({ x: w / 2, y: h / 2 })
    // molde começa no meio, ocupando ~30% da altura da foto
    setMolde({ cx: w / 2, cy: h * 0.42, s: (h * 0.3) / Math.max(dims.largura, dims.altura), ang: 0 })
    setLivres(null)
    setGravadas([])
    setAviso(null)
    setMedida([
      { x: w * 0.15, y: h * 0.85 },
      { x: w * 0.85, y: h * 0.85 },
    ])
  }

  const cantos = livres ?? cantosDoMolde(molde, dims.largura, dims.altura)
  const H = homografiaDaReferencia(cantos, dims.largura, dims.altura)
  /** distância real entre dois pontos da foto (as gravadas se recalculam se o molde mudar) */
  const medir = (a: Ponto, b: Ponto): number | null => {
    if (!H) return null
    const p = H(a)
    const q = H(b)
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    return Number.isFinite(d) && d < 10000 ? Math.round(d * 10) / 10 : null
  }
  const cm = medida.length === 2 ? medir(medida[0]!, medida[1]!) : null
  const referenciaNome =
    ref === 'azulejo'
      ? `peça de ${refW} × ${refH} cm`
      : `${REFERENCIAS[ref].nome}, ${String(dims.largura).replace('.', ',')} × ${String(dims.altura).replace('.', ',')} cm`

  const gravar = () => {
    if (medida.length !== 2 || cm === null || !foto) return
    setGravadas((l) => [...l, { id: novoId(), nome: nomeNova.trim() || `Medida ${l.length + 1}`, a: medida[0]!, b: medida[1]! }])
    setNomeNova('')
    setAviso(null)
    // a próxima medida começa em pé, no meio do que está na tela
    const v = vistaDe(foto, zoom, centro)
    setMedida([
      { x: v.x + v.w * 0.5, y: v.y + v.h * 0.25 },
      { x: v.x + v.w * 0.5, y: v.y + v.h * 0.75 },
    ])
  }

  const refazer = (g: Gravada) => {
    setGravadas((l) => l.filter((x) => x.id !== g.id))
    setMedida([g.a, g.b])
    setNomeNova(g.nome)
  }

  const desenhadas = () => gravadas.map((g) => ({ nome: g.nome, a: g.a, b: g.b, cm: medir(g.a, g.b) ?? 0 }))

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
        medidas: desenhadas().map(({ nome, cm }) => ({ nome, cm })),
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

  /** toque na foto (fora das alças): um dedo arrasta a vista, dois dedos dão zoom */
  const tocarFundo = (e: React.PointerEvent) => {
    capturar(e)
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
    if (arrasto.tipo === 'medida') return setMedida((l) => l.map((q, i) => (i === arrasto.i ? p : q)))
    if (arrasto.tipo === 'gravada')
      return setGravadas((l) => l.map((g) => (g.id === arrasto.id ? (arrasto.i === 0 ? { ...g, a: p } : { ...g, b: p }) : g)))
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
            cima da folha e coloque os pontos laranja nas pontas do que quer medir.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-10 text-stone-500 hover:border-orange-500 dark:border-stone-600">
          <Camera size={28} />
          Tirar ou escolher foto
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
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
  const gravadaAlvo = arrasto?.tipo === 'gravada' ? gravadas.find((g) => g.id === arrasto.id) : undefined
  const alvo = !arrasto
    ? null
    : arrasto.tipo === 'medida'
      ? medida[arrasto.i]
      : arrasto.tipo === 'canto' || arrasto.tipo === 'livre'
        ? cantos[arrasto.i]
        : gravadaAlvo && arrasto.tipo === 'gravada'
          ? arrasto.i === 0
            ? gravadaAlvo.a
            : gravadaAlvo.b
          : null
  const letra = 13 * unidadePorPx
  const lupa = 40 * unidadePorPx
  const botao = 'rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800'

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
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
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
          {gravadas.map((g, i) => {
            const cor = corDaMedida(i)
            const meio = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
            const valor = formatarCm(medir(g.a, g.b) ?? 0)
            return (
              <g key={g.id}>
                <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke="#fff" strokeWidth={traco * 3} strokeLinecap="round" />
                <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={cor} strokeWidth={traco * 1.5} strokeLinecap="round" />
                {[g.a, g.b].map((p, k) => (
                  <circle key={k} cx={p.x} cy={p.y} r={raio * 0.75} fill={cor} stroke="#fff" strokeWidth={traco} onPointerDown={(e) => comecar(e, { tipo: 'gravada', id: g.id, i: k })} />
                ))}
                <g pointerEvents="none">
                  <rect
                    x={meio.x - letra * 0.9}
                    y={meio.y - letra * 2.6}
                    width={letra * 2 + letra * 0.6 * valor.length}
                    height={letra * 1.7}
                    rx={letra * 0.85}
                    fill="#fff"
                    stroke={cor}
                    strokeWidth={traco}
                  />
                  <circle cx={meio.x} cy={meio.y - letra * 1.75} r={letra * 0.7} fill={cor} />
                  <text x={meio.x} y={meio.y - letra * 1.75} dy="0.35em" fontSize={letra * 0.9} fontWeight={700} fill="#fff" textAnchor="middle">
                    {i + 1}
                  </text>
                  <text x={meio.x + letra * 0.95} y={meio.y - letra * 1.75} dy="0.35em" fontSize={letra} fontWeight={700} fill="#1c1917">
                    {valor}
                  </text>
                </g>
              </g>
            )
          })}
          {medida.length === 2 && (
            <line
              x1={medida[0]!.x}
              y1={medida[0]!.y}
              x2={medida[1]!.x}
              y2={medida[1]!.y}
              stroke="#f97316"
              strokeWidth={traco * 1.5}
              strokeDasharray={`${traco * 4} ${traco * 3}`}
            />
          )}
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
          {medida.map((p, i) => (
            <circle key={`m${i}`} cx={p.x} cy={p.y} r={raio} fill="rgba(249,115,22,0.5)" stroke="#fff" strokeWidth={traco} onPointerDown={(e) => comecar(e, { tipo: 'medida', i })} />
          ))}
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
        <span className="font-medium text-orange-600">Laranja</span>: as pontas do que quer medir. Só vale na mesma parede da folha.
      </p>

      <div className="rounded-xl bg-stone-900 p-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{cm !== null ? formatarCm(cm) : '—'}</span>
          {onUsar && cm !== null && (
            <button className="rounded-lg bg-stone-700 px-3 py-2 text-sm font-medium" onClick={() => onUsar(cm)}>
              Usar
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 text-sm outline-none placeholder:text-stone-500 focus:ring-2 focus:ring-orange-500"
            placeholder={`Nome da medida ${gravadas.length + 1} (ex.: largura da parede)`}
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && gravar()}
          />
          <button className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium disabled:opacity-50" onClick={gravar} disabled={cm === null}>
            <Plus size={16} /> Gravar
          </button>
        </div>
      </div>

      {gravadas.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Medidas gravadas nesta foto</div>
          {gravadas.map((g, i) => {
            const valor = medir(g.a, g.b)
            return (
              <div key={g.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1.5 dark:border-stone-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: corDaMedida(i) }}>
                  {i + 1}
                </span>
                <input
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-300 focus:border-orange-500 focus:outline-none"
                  value={g.nome}
                  onChange={(e) => setGravadas((l) => l.map((x) => (x.id === g.id ? { ...x, nome: e.target.value } : x)))}
                  aria-label={`Nome da medida ${i + 1}`}
                />
                <span className="shrink-0 font-semibold tabular-nums">{valor !== null ? formatarCm(valor) : '—'}</span>
                {onUsar && valor !== null && (
                  <button className="shrink-0 rounded-md px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" onClick={() => onUsar(valor)}>
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
