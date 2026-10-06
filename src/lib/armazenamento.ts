import { projetoVazio, type Projeto } from './tipos'

const CHAVE = 'planta-ia.projeto'

export function carregarProjeto(): Projeto {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (bruto) {
      const p = JSON.parse(bruto) as Projeto
      if (p && p.versao === 1 && Array.isArray(p.comodos)) return p
    }
  } catch {
    // armazenamento indisponível (aba anônima, bloqueado): começa vazio
  }
  return projetoVazio()
}

export function salvarProjeto(p: Projeto) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p))
  } catch {
    // sem armazenamento local o projeto ainda pode ser salvo como arquivo
  }
}

export function baixar(conteudo: Blob | string, nome: string, tipo = 'application/octet-stream') {
  const blob = typeof conteudo === 'string' ? new Blob([conteudo], { type: tipo }) : conteudo
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const nomeArquivo = (p: Projeto) =>
  p.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'planta'
