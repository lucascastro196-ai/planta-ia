/**
 * Imagens das fotos anotadas. Ficam no IndexedDB do aparelho porque são
 * grandes demais para o localStorage; o projeto guarda só o id.
 */

const BANCO = 'planta-ia'
const LOJA = 'imagens'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA)
    req.onsuccess = () => ok(req.result)
    req.onerror = () => erro(req.error)
  })
}

async function operar<T>(modo: IDBTransactionMode, f: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  try {
    return await new Promise<T>((ok, erro) => {
      const req = f(db.transaction(LOJA, modo).objectStore(LOJA))
      req.onsuccess = () => ok(req.result)
      req.onerror = () => erro(req.error)
    })
  } finally {
    db.close()
  }
}

export const salvarImagem = (id: string, blob: Blob) => operar('readwrite', (l) => l.put(blob, id)).then(() => undefined)
export const lerImagem = (id: string) => operar<Blob | undefined>('readonly', (l) => l.get(id) as IDBRequest<Blob | undefined>)
export const apagarImagem = (id: string) => operar('readwrite', (l) => l.delete(id)).then(() => undefined)

export function blobParaDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.onerror = () => erro(r.error)
    r.readAsDataURL(b)
  })
}

export async function dataUrlParaBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}
