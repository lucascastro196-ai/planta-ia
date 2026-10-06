import { createContext } from 'react'

export interface NovaFoto {
  blob: Blob
  titulo: string
  referencia: string
  medidas: { nome: string; cm: number; area?: number; lados?: number[] }[]
  comodoId?: string
}

/** Quem guarda a foto anotada no projeto (o App). Fora dele, o botão de anexar some. */
export const AnexarFoto = createContext<((f: NovaFoto) => Promise<void>) | null>(null)
