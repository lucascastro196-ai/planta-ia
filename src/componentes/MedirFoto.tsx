import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Info, Maximize, RotateCw, ScanSearch, ZoomIn, ZoomOut } from 'lucide-react'
import { homografiaDaReferencia, REFERENCIAS, type Referencia } from '@/lib/homografia'
import type { Ponto } from '@/lib/tipos'

interface Props {
  /** com valor: mostra o botão "Usar" */
  onUsar?: (cm: number) => void
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
  | { tipo: 'pan'; tela: Ponto; centro: Ponto }
  | { tipo: 'pinca'; dist: number; zoom: number }

const numero = (s: string) => Number(s.replace(',', '.'))
/** raio das alças em pixels de tela, qualquer que seja o tamanho da foto */
const RAIO_TELA = 11
const ZOOM_MAX = 12

/** Cantos locais (em cm) na ordem: cima-esq, cima-dir, baixo-dir, baixo-esq. */
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

export function MedirFoto({ onUsar }: Props) {
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
    setMedida([
      { x: w * 0.15, y: h * 0.85 },
      { x: w * 0.85, y: h * 0.85 },
    ])
  }

  const cantos = livres ?? cantosDoMolde(molde, dims.largura, dims.altura)
  const H = useMemo(() => homografiaDaReferencia(cantos, dims.largura, dims.altura), [cantos, dims.largura, dims.altura])
  let cm: number | null = null
  if (H && medida.length === 2) {
    const a = H(medida[0]!)
    const b = H(medida[1]!)
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    if (Number.isFinite(d) && d < 10000) cm = Math.round(d * 10) / 10
  }

  const naFoto = (e: React.PointerEvent): Ponto => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: Math.min(Math.max(p.x, 0), foto!.w), y: Math.min(Math.max(p.y, 0), foto!.h) }
  }

  const comecar = (e: React.PointerEvent, a: Arrasto) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    toques.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setArrasto(a)
  }

  /** toque na foto (fora das alças): um dedo arrasta a vista, dois dedos dão zoom */
  const tocarFundo = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId)
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
  const alvo = !arrasto ? null : arrasto.tipo === 'medida' ? medida[arrasto.i] : arrasto.tipo === 'canto' || arrasto.tipo === 'livre' ? cantos[arrasto.i] : null
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
          {medida.length === 2 && <line x1={medida[0]!.x} y1={medida[0]!.y} x2={medida[1]!.x} y2={medida[1]!.y} stroke="#f97316" strokeWidth={traco * 1.5} />}
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

      <div className="flex items-center justify-between rounded-xl bg-stone-900 px-4 py-3 text-white">
        <span className="text-2xl font-semibold tabular-nums">{cm !== null ? `${cm.toFixed(1).replace('.', ',')} cm` : '—'}</span>
        {onUsar && cm !== null && (
          <button className="rounded-lg bg-orange-600 px-4 py-2 font-medium" onClick={() => onUsar(cm!)}>
            Usar
          </button>
        )}
      </div>
    </div>
  )
}
