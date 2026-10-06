import { useEffect, useRef, useState } from 'react'
import { Crosshair, Info, Undo2, X } from 'lucide-react'
import type { Ponto } from '@/lib/tipos'

/**
 * Medição ao vivo com a câmera (WebXR + hit-test). Funciona no Chrome do
 * Android com ARCore. A interface fica num "dom-overlay" por cima da câmera e
 * os pontos 3D são projetados na tela à mão, sem biblioteca 3D.
 */

type Vec3 = { x: number; y: number; z: number }
type Modo = 'distancia' | 'contorno'

interface Props {
  /** com valor: mede uma distância e oferece "Usar" */
  onUsar?: (cm: number) => void
  /** sem onUsar: também permite contornar o piso e criar o cômodo */
  onContorno?: (pontosCm: Ponto[]) => void
}

export type SuporteAR = 'sim' | 'nao' | 'inseguro' | 'verificando'

export function useSuporteAR(): SuporteAR {
  const [s, setS] = useState<SuporteAR>('verificando')
  useEffect(() => {
    if (!window.isSecureContext) return setS('inseguro')
    if (!navigator.xr) return setS('nao')
    navigator.xr
      .isSessionSupported('immersive-ar')
      .then((ok) => setS(ok ? 'sim' : 'nao'))
      .catch(() => setS('nao'))
  }, [])
  return s
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const cm = (m: number) => `${(m * 100).toFixed(1).replace('.', ',')} cm`

/** Multiplica matriz 4×4 (coluna-maior, como o WebXR entrega) por um ponto. */
function projetar(m: Float32Array, p: Vec3) {
  const x = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!
  const y = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!
  const w = m[3]! * p.x + m[7]! * p.y + m[11]! * p.z + m[15]!
  return { x, y, w }
}

function multiplicar(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[k * 4 + l]! * b[c * 4 + k]!
    r[c * 4 + l] = s
  }
  return r
}

export function MedirAR({ onUsar, onContorno }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const sessao = useRef<XRSession | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('distancia')
  const [pontos, setPontos] = useState<Vec3[]>([])
  const [mira, setMira] = useState<Vec3 | null>(null)
  const [tela, setTela] = useState<{ mira: { x: number; y: number } | null; pontos: ({ x: number; y: number } | null)[] }>({ mira: null, pontos: [] })
  const pontosRef = useRef<Vec3[]>([])
  pontosRef.current = pontos
  const miraRef = useRef<Vec3 | null>(null)
  const [medidas, setMedidas] = useState<number[]>([])

  useEffect(() => () => void sessao.current?.end().catch(() => {}), [])

  async function iniciar() {
    setErro(null)
    try {
      const s = await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local', 'dom-overlay'],
        domOverlay: { root: raiz.current! },
      })
      sessao.current = s
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true })!
      await s.updateRenderState({ baseLayer: new XRWebGLLayer(s, gl) })
      const local = await s.requestReferenceSpace('local')
      const viewer = await s.requestReferenceSpace('viewer')
      const fonte = await s.requestHitTestSource!({ space: viewer })
      s.addEventListener('end', () => {
        fonte?.cancel()
        sessao.current = null
        setAtivo(false)
        setMira(null)
      })
      setAtivo(true)
      setPontos([])

      const quadro = (_t: number, frame: XRFrame) => {
        s.requestAnimationFrame(quadro)
        const camada = s.renderState.baseLayer!
        gl.bindFramebuffer(gl.FRAMEBUFFER, camada.framebuffer)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

        const pose = frame.getViewerPose(local)
        const hit = fonte ? frame.getHitTestResults(fonte)[0]?.getPose(local)?.transform.position : undefined
        const m = hit ? { x: hit.x, y: hit.y, z: hit.z } : null
        miraRef.current = m
        setMira(m)
        const view = pose?.views[0]
        const el = raiz.current
        if (!view || !el) return
        const mvp = multiplicar(view.projectionMatrix, view.transform.inverse.matrix)
        const W = el.clientWidth
        const H = el.clientHeight
        const naTela = (p: Vec3) => {
          const c = projetar(mvp, p)
          if (c.w <= 0) return null
          return { x: ((c.x / c.w + 1) / 2) * W, y: ((1 - c.y / c.w) / 2) * H }
        }
        setTela({ mira: m ? naTela(m) : null, pontos: pontosRef.current.map(naTela) })
      }
      s.requestAnimationFrame(quadro)
    } catch (e) {
      setErro(`Não foi possível abrir a câmera em realidade aumentada${e instanceof Error ? `: ${e.message}` : ''}.`)
    }
  }

  const marcar = () => {
    const m = miraRef.current
    if (!m) return
    if (modo === 'distancia') {
      if (pontos.length >= 2) return setPontos([m])
      const novos = [...pontos, m]
      setPontos(novos)
      if (novos.length === 2) setMedidas((l) => [dist(novos[0]!, novos[1]!), ...l].slice(0, 6))
    } else setPontos([...pontos, m])
  }

  const encerrar = () => sessao.current?.end().catch(() => {})

  const ultimaDistancia = pontos.length === 2 ? dist(pontos[0]!, pontos[1]!) : pontos.length === 1 && mira ? dist(pontos[0]!, mira) : null
  const perimetro =
    modo === 'contorno' && pontos.length > 0 ? pontos.reduce((s, p, i) => s + (i ? dist(pontos[i - 1]!, p) : 0), 0) + (mira ? dist(pontos[pontos.length - 1]!, mira) : 0) : 0

  const fecharContorno = () => {
    if (pontos.length < 3 || !onContorno) return
    // vista de cima: x continua x, z (para trás) vira y da planta
    onContorno(pontos.map((p) => ({ x: Math.round(p.x * 1000) / 10, y: Math.round(p.z * 1000) / 10 })))
    encerrar()
  }

  const usar = (m: number) => {
    onUsar?.(Math.round(m * 1000) / 10)
    encerrar()
  }

  const linhas: [number, number][] = []
  for (let i = 1; i < tela.pontos.length; i++) linhas.push([i - 1, i])

  return (
    <div ref={raiz} className={ativo ? 'fixed inset-0 z-50 bg-transparent text-white' : 'space-y-4 p-1 text-sm'}>
      {!ativo ? (
        <>
          <div className="flex gap-2 rounded-lg bg-stone-100 p-3 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            <Info size={18} className="mt-0.5 shrink-0" />
            <p>
              Mova o celular devagar apontando para o piso até o círculo aparecer. Mire numa ponta e toque em <b>Marcar</b>, depois na outra.
              {!onUsar && ' No modo contorno, marque os cantos do piso em sequência e a planta do cômodo sai pronta.'}
            </p>
          </div>
          {!onUsar && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
              {(['distancia', 'contorno'] as const).map((m) => (
                <button key={m} className={`rounded-md py-1.5 ${modo === m ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`} onClick={() => setModo(m)}>
                  {m === 'distancia' ? 'Distância' : 'Contorno do cômodo'}
                </button>
              ))}
            </div>
          )}
          {medidas.length > 0 && (
            <div className="space-y-1">
              {medidas.map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800">
                  <span className="font-medium tabular-nums">{cm(m)}</span>
                  {onUsar && (
                    <button className="text-orange-600" onClick={() => usar(m)}>
                      Usar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {erro && <p className="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 font-medium text-white dark:bg-orange-600" onClick={iniciar}>
            <Crosshair size={18} /> Abrir câmera
          </button>
        </>
      ) : (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {linhas.map(([a, b]) => {
              const p = tela.pontos[a]
              const q = tela.pontos[b]
              return p && q ? <line key={b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#f97316" strokeWidth={3} /> : null
            })}
            {modo === 'contorno' && pontos.length >= 3 && tela.pontos[0] && tela.pontos[pontos.length - 1] && (
              <line x1={tela.pontos[0].x} y1={tela.pontos[0].y} x2={tela.pontos[pontos.length - 1]!.x} y2={tela.pontos[pontos.length - 1]!.y} stroke="#f97316" strokeWidth={2} strokeDasharray="8 6" />
            )}
            {tela.mira && pontos.length > 0 && !(modo === 'distancia' && pontos.length === 2) && tela.pontos[pontos.length - 1] && (
              <line x1={tela.pontos[pontos.length - 1]!.x} y1={tela.pontos[pontos.length - 1]!.y} x2={tela.mira.x} y2={tela.mira.y} stroke="#fff" strokeWidth={2} strokeDasharray="6 6" />
            )}
            {tela.pontos.map((p, i) => (p ? <circle key={i} cx={p.x} cy={p.y} r={7} fill="#f97316" stroke="#fff" strokeWidth={2} /> : null))}
            {tela.mira && (
              <g>
                <circle cx={tela.mira.x} cy={tela.mira.y} r={18} fill="none" stroke="#fff" strokeWidth={3} />
                <circle cx={tela.mira.x} cy={tela.mira.y} r={3} fill="#fff" />
              </g>
            )}
          </svg>

          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <div className="rounded-xl bg-black/60 px-4 py-2">
              <div className="text-3xl font-semibold tabular-nums">
                {modo === 'distancia' ? (ultimaDistancia !== null ? cm(ultimaDistancia) : '—') : cm(perimetro)}
              </div>
              <div className="text-xs text-white/70">
                {!mira
                  ? 'Procurando superfície… mova o celular devagar'
                  : modo === 'distancia'
                    ? pontos.length === 0
                      ? 'Mire na primeira ponta'
                      : pontos.length === 1
                        ? 'Mire na segunda ponta'
                        : 'Medida pronta'
                    : `${pontos.length} canto(s) · perímetro`}
              </div>
            </div>
            <button className="rounded-full bg-black/60 p-3" onClick={encerrar} aria-label="Sair">
              <X size={22} />
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <button className="rounded-full bg-black/60 p-4 disabled:opacity-40" onClick={() => setPontos((l) => l.slice(0, -1))} disabled={pontos.length === 0} aria-label="Desfazer ponto">
              <Undo2 size={22} />
            </button>
            <button className="rounded-full bg-white px-8 py-4 text-lg font-semibold text-stone-900 disabled:opacity-40" onClick={marcar} disabled={!mira}>
              Marcar
            </button>
            {modo === 'distancia' && onUsar && pontos.length === 2 && (
              <button className="rounded-full bg-orange-600 px-6 py-4 text-lg font-semibold" onClick={() => usar(dist(pontos[0]!, pontos[1]!))}>
                Usar
              </button>
            )}
            {modo === 'contorno' && (
              <button className="rounded-full bg-orange-600 px-6 py-4 text-lg font-semibold disabled:opacity-40" onClick={fecharContorno} disabled={pontos.length < 3}>
                Fechar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
