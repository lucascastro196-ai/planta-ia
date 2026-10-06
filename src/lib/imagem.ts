import type { FotoEnviada } from './leitura'

/** Lado maior que a IA aproveita sem perder detalhe; acima disso só aumenta o envio. */
const LADO_MAXIMO = 1568

/** Reduz e converte a foto para JPEG no próprio aparelho antes de enviar. */
export async function prepararFoto(arquivo: File): Promise<FotoEnviada & { previa: string }> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { media_type: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), previa: url }
}
