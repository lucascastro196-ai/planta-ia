import { useMemo, useRef, useState } from 'react'
import { Camera, Info } from 'lucide-react'
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

type Alca = { grupo: 'ref'; i: number } | { grupo: 'medida'; i: number }

const numero = (s: string) => Number(s.replace(',', '.'))

export function MedirFoto({ onUsar }: Props) {
  const [foto, setFoto] = useState<Foto | null>(null)
  const [ref, setRef] = useState<Referencia>('a4')
  const [refW, setRefW] = useState('60')
  const [refH, setRefH] = useState('60')
  const [cantos, setCantos] = useState<Ponto[]>([])
  const [medida, setMedida] = useState<Ponto[]>([])
  const [arrastando, setArrastando] = useState<Alca | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  async function abrir(arquivo: File | undefined) {
    if (!arquivo) return
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.src = url
    await img.decode()
    const { naturalWidth: w, naturalHeight: h } = img
    setFoto({ url, w, h })
    // referência no meio e régua embaixo: a pessoa só ajusta
    const s = Math.min(w, h)
    setCantos([
      { x: w / 2 - s * 0.1, y: h / 2 - s * 0.14 },
      { x: w / 2 + s * 0.1, y: h / 2 - s * 0.14 },
      { x: w / 2 + s * 0.1, y: h / 2 + s * 0.14 },
      { x: w / 2 - s * 0.1, y: h / 2 + s * 0.14 },
    ])
    setMedida([
      { x: w * 0.2, y: h * 0.8 },
      { x: w * 0.8, y: h * 0.8 },
    ])
  }

  const dims = ref === 'azulejo' ? { largura: numero(refW), altura: numero(refH) } : REFERENCIAS[ref]
  const H = useMemo(
    () => (cantos.length === 4 && dims.largura > 0 && dims.altura > 0 ? homografiaDaReferencia(cantos, dims.largura, dims.altura) : null),
    [cantos, dims.largura, dims.altura],
  )
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

  const mover = (e: React.PointerEvent) => {
    if (!arrastando) return
    const p = naFoto(e)
    if (arrastando.grupo === 'ref') setCantos((l) => l.map((q, i) => (i === arrastando.i ? p : q)))
    else setMedida((l) => l.map((q, i) => (i === arrastando.i ? p : q)))
  }

  if (!foto) {
    return (
      <div className="space-y-4 p-1 text-sm">
        <div className="flex gap-2 rounded-lg bg-stone-100 p-3 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          <Info size={18} className="mt-0.5 shrink-0" />
          <p>
            Encoste uma folha A4 (ou um cartão) na parede que vai medir e fotografe a parede inteira, o mais de frente possível. Depois é só ajustar os 4 cantos
            da folha e as duas pontas da medida.
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

  const raio = Math.max(foto.w, foto.h) / 70
  const traco = raio / 4
  const alvo = arrastando ? (arrastando.grupo === 'ref' ? cantos[arrastando.i] : medida[arrastando.i]) : null
  const zoom = raio * 5

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
          viewBox={`0 0 ${foto.w} ${foto.h}`}
          className="block max-h-[60dvh] w-full touch-none select-none rounded-lg bg-black"
          onPointerMove={mover}
          onPointerUp={() => setArrastando(null)}
          onPointerCancel={() => setArrastando(null)}
        >
          <image href={foto.url} width={foto.w} height={foto.h} />
          <polygon points={cantos.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth={traco} />
          {medida.length === 2 && <line x1={medida[0]!.x} y1={medida[0]!.y} x2={medida[1]!.x} y2={medida[1]!.y} stroke="#f97316" strokeWidth={traco * 1.5} />}
          {cantos.map((p, i) => (
            <circle
              key={`r${i}`}
              cx={p.x}
              cy={p.y}
              r={raio}
              fill="rgba(59,130,246,0.35)"
              stroke="#fff"
              strokeWidth={traco}
              onPointerDown={(e) => (e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId), setArrastando({ grupo: 'ref', i }))}
            />
          ))}
          {medida.map((p, i) => (
            <circle
              key={`m${i}`}
              cx={p.x}
              cy={p.y}
              r={raio}
              fill="rgba(249,115,22,0.35)"
              stroke="#fff"
              strokeWidth={traco}
              onPointerDown={(e) => (e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId), setArrastando({ grupo: 'medida', i }))}
            />
          ))}
        </svg>
        {alvo && (
          // lupa: o dedo cobre o ponto, então mostra ampliado no canto
          <svg
            viewBox={`${alvo.x - zoom} ${alvo.y - zoom} ${zoom * 2} ${zoom * 2}`}
            className="pointer-events-none absolute top-2 left-2 h-28 w-28 rounded-full border-2 border-white bg-black shadow-lg"
          >
            <image href={foto.url} width={foto.w} height={foto.h} />
            <line x1={alvo.x - zoom} y1={alvo.y} x2={alvo.x + zoom} y2={alvo.y} stroke="#fff" strokeWidth={traco / 2} />
            <line x1={alvo.x} y1={alvo.y - zoom} x2={alvo.x} y2={alvo.y + zoom} stroke="#fff" strokeWidth={traco / 2} />
          </svg>
        )}
      </div>

      <p className="text-xs text-stone-500">
        <span className="font-medium text-blue-600">Azul</span>: os 4 cantos da referência. <span className="font-medium text-orange-600">Laranja</span>: as pontas do que
        quer medir. Só vale para pontos no mesmo plano da referência (a mesma parede).
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
