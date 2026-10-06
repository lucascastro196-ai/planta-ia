import { z } from 'zod/v4'

/**
 * O que a IA devolve depois de olhar as fotos de UM cômodo.
 * Fica em src/ porque o Worker valida com ele e o app monta a planta com ele.
 */
export const LeituraComodo = z.object({
  nome: z.string().describe('nome do cômodo em português, ex.: "Sala", "Quarto 1", "Cozinha"'),
  paredes: z
    .array(
      z.object({
        descricao: z.string().describe('como reconhecer a parede nas fotos, ex.: "parede da janela grande"'),
        comprimento_cm: z.number().describe('comprimento da face interna da parede, em centímetros'),
        giro_graus: z
          .number()
          .describe(
            'ao chegar no fim desta parede, quanto se vira (visto de cima, andando pelo cômodo no sentido horário) para seguir pela próxima: 90 num canto comum; -90 num canto reentrante (o canto de dentro de um L); outro valor só se a parede for inclinada',
          ),
      }),
    )
    .describe('paredes em sequência, no sentido horário visto de cima; a última termina onde a primeira começa'),
  pe_direito_cm: z.number().describe('altura do piso ao teto, em centímetros'),
  aberturas: z.array(
    z.object({
      tipo: z.enum(['porta', 'janela']),
      parede: z.number().describe('índice (começando em 0) da parede na lista de paredes'),
      distancia_inicio_cm: z
        .number()
        .describe('distância, ao longo da parede, do início dela (o canto de onde ela sai no sentido horário) até a borda mais próxima do vão'),
      largura_cm: z.number(),
      altura_cm: z.number(),
      peitoril_cm: z.number().describe('altura do piso até a base do vão; 0 para portas'),
    }),
  ),
  confianca: z.enum(['alta', 'media', 'baixa']).describe('quão confiáveis são as medidas no conjunto'),
  observacoes: z
    .array(z.string())
    .describe('frases curtas, em português, sobre o que foi estimado e deve ser conferido com trena (ex.: "parede 3 não aparece nas fotos")'),
})

export type LeituraComodo = z.infer<typeof LeituraComodo>

/** Uma medida que a pessoa tirou com a trena. */
export interface MedidaInformada {
  descricao: string
  metros: number
}

export interface FotoEnviada {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string
}

export interface PedidoAnalise {
  nome?: string
  fotos: FotoEnviada[]
  medidas: MedidaInformada[]
  peDireitoMetros?: number
  observacao?: string
}
