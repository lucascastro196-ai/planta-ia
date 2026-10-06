/**
 * Modelo da planta. Todas as medidas em centímetros.
 * Coordenadas como na tela: x para a direita, y para baixo.
 * Os pontos de um cômodo são a FACE INTERNA das paredes, percorrida no
 * sentido horário (na tela). A espessura da parede cresce para fora.
 */

export interface Ponto {
  x: number
  y: number
}

export type TipoAbertura = 'porta' | 'janela'

export interface Abertura {
  id: string
  tipo: TipoAbertura
  /** parede i vai do ponto i ao ponto i+1 */
  parede: number
  /** distância do início da parede até o centro da abertura */
  centro: number
  largura: number
  altura: number
  /** altura do piso até a base da abertura (0 nas portas) */
  peitoril: number
  /** porta: dobradiça no fim da parede em vez do início */
  inverter?: boolean
}

export interface Comodo {
  id: string
  nome: string
  pontos: Ponto[]
  peDireito: number
  aberturas: Abertura[]
  /** o que a IA não teve certeza (vem da análise das fotos) */
  observacoes?: string[]
  confianca?: 'alta' | 'media' | 'baixa'
}

export interface Projeto {
  versao: 1
  nome: string
  espessuraParede: number
  comodos: Comodo[]
}

export function novoId(): string {
  return crypto.randomUUID().slice(0, 8)
}

export function projetoVazio(): Projeto {
  return { versao: 1, nome: 'Novo projeto', espessuraParede: 15, comodos: [] }
}
