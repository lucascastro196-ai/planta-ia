import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Ponto } from '@/lib/tipos'
import { MedirAR, useSuporteAR } from './MedirAR'
import { MedirFoto } from './MedirFoto'

interface Props {
  titulo?: string
  onFechar: () => void
  /** pede um valor (preenche um campo): mostra "Usar" */
  onUsar?: (cm: number) => void
  /** cria cômodo a partir do contorno medido em AR */
  onContorno?: (pontosCm: Ponto[]) => void
  /** fotos anexadas a partir daqui ficam ligadas a este cômodo */
  comodoId?: string
  tituloFoto?: string
}

export function Medidor({ titulo = 'Medir com a câmera', onFechar, onUsar, onContorno, comodoId, tituloFoto }: Props) {
  const suporte = useSuporteAR()
  const [aba, setAba] = useState<'ar' | 'foto'>('foto')
  useEffect(() => {
    if (suporte === 'sim') setAba('ar')
  }, [suporte])

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onFechar}>
      <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-sm dark:bg-stone-800">
          <button className={`rounded-md py-1.5 ${aba === 'ar' ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`} onClick={() => setAba('ar')}>
            Câmera ao vivo (AR)
          </button>
          <button className={`rounded-md py-1.5 ${aba === 'foto' ? 'bg-white font-medium shadow-sm dark:bg-stone-700' : 'text-stone-500'}`} onClick={() => setAba('foto')}>
            Medir na foto
          </button>
        </div>
        {aba === 'ar' ? (
          suporte === 'sim' ? (
            <MedirAR onUsar={onUsar} onContorno={onContorno} />
          ) : (
            <div className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {suporte === 'verificando' && <p>Verificando a câmera…</p>}
              {suporte === 'inseguro' && <p>A câmera ao vivo só funciona com o site aberto em endereço seguro (https). Abra pelo endereço publicado do app.</p>}
              {suporte === 'nao' && (
                <p>
                  Este aparelho/navegador não oferece realidade aumentada. Funciona no <b>Chrome do Android</b> com ARCore (a maioria dos celulares Android
                  atuais). No iPhone o Safari ainda não permite — use <b>Medir na foto</b>.
                </p>
              )}
              <button className="font-medium text-orange-700 underline dark:text-orange-300" onClick={() => setAba('foto')}>
                Medir na foto
              </button>
            </div>
          )
        ) : (
          <MedirFoto onUsar={onUsar} comodoId={comodoId} tituloPadrao={tituloFoto} />
        )}
      </div>
    </div>
  )
}
