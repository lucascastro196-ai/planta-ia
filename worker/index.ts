import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { LeituraComodo, type PedidoAnalise } from '../src/lib/leitura'

interface Env {
  ANTHROPIC_API_KEY?: string
  ASSETS: Fetcher
}

const LIMITE_FOTOS = 10
// base64 de uma foto já reduzida no aparelho (1568 px) fica bem abaixo disso
const LIMITE_FOTO_BASE64 = 6_000_000
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

const SISTEMA = `Você é um arquiteto especialista em levantamento métrico de ambientes a partir de fotografias.

Recebe fotos de UM cômodo e uma ou mais medidas tiradas com trena. Sua tarefa é reconstruir a planta baixa desse cômodo: a sequência de paredes com seus comprimentos, os cantos, o pé-direito e as portas e janelas.

Como trabalhar:
- Primeiro identifique cada parede e cada canto, cruzando as fotos (a mesma parede costuma aparecer em mais de uma foto, de ângulos diferentes).
- Use as medidas informadas como escala. Propague a escala por elementos que aparecem junto delas e por referências de tamanho conhecido: portas internas (normalmente 70–90 cm × 210 cm), tomadas e interruptores (eixo ~30 cm e ~110 cm do piso), piso cerâmico (contar peças quando a dimensão for evidente), bancadas (~90 cm de altura), rodapés, batentes.
- As medidas informadas são verdade: a planta precisa respeitá-las exatamente.
- Percorra o cômodo no sentido horário visto de cima. Comece pela parede que tiver a medida informada, ou pela mais visível. A última parede termina onde a primeira começa, então a soma dos giros deve dar 360.
- Paredes não fotografadas: deduza pelo fechamento do polígono e diga isso nas observações.
- Não invente cômodos vizinhos; descreva só o cômodo das fotos. Vãos para outros ambientes sem folha de porta contam como porta.
- Se uma informação não puder ser vista, use o padrão brasileiro (pé-direito 270 cm, porta 80×210, janela com peitoril de 110 cm) e registre nas observações.

Seja honesto na confiança: "alta" só quando várias medidas se confirmam entre si.`

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function validarPedido(corpo: unknown): PedidoAnalise | string {
  if (!corpo || typeof corpo !== 'object') return 'Pedido inválido.'
  const p = corpo as Partial<PedidoAnalise>
  if (!Array.isArray(p.fotos) || p.fotos.length === 0) return 'Envie pelo menos uma foto.'
  if (p.fotos.length > LIMITE_FOTOS) return `Envie no máximo ${LIMITE_FOTOS} fotos por cômodo.`
  for (const f of p.fotos) {
    if (!f || !TIPOS.has(f.media_type) || typeof f.data !== 'string' || f.data.length > LIMITE_FOTO_BASE64) return 'Foto inválida ou grande demais.'
  }
  if (!Array.isArray(p.medidas) || p.medidas.length === 0) return 'Informe pelo menos uma medida tirada com trena.'
  for (const m of p.medidas) {
    if (!m || typeof m.descricao !== 'string' || !m.descricao.trim() || typeof m.metros !== 'number' || !(m.metros > 0) || m.metros > 100)
      return 'Cada medida precisa de uma descrição e um valor em metros.'
  }
  return p as PedidoAnalise
}

async function analisar(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ erro: 'Falta configurar ANTHROPIC_API_KEY no servidor (.dev.vars no desenvolvimento).' }, 500)
  const pedido = validarPedido(await req.json().catch(() => null))
  if (typeof pedido === 'string') return json({ erro: pedido }, 400)

  const medidas = pedido.medidas.map((m) => `- ${m.descricao.trim()}: ${m.metros.toFixed(2)} m`).join('\n')
  const texto = [
    pedido.nome?.trim() ? `Cômodo: ${pedido.nome.trim()}` : null,
    `Medidas tiradas com trena:\n${medidas}`,
    pedido.peDireitoMetros ? `Pé-direito medido: ${pedido.peDireitoMetros.toFixed(2)} m` : null,
    pedido.observacao?.trim() ? `Observação de quem fotografou: ${pedido.observacao.trim()}` : null,
    `São ${pedido.fotos.length} foto(s), na ordem em que foram tiradas. Reconstrua a planta baixa deste cômodo.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  pedido.fotos.forEach((f, i) => {
    content.push({ type: 'text', text: `Foto ${i + 1}:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } })
  })
  content.push({ type: 'text', text: texto })

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  try {
    const resposta = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // se o modelo principal recusar, a própria API tenta de novo com outro modelo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: betaZodOutputFormat(LeituraComodo) },
      system: SISTEMA,
      messages: [{ role: 'user', content }],
    })
    if (resposta.stop_reason === 'refusal') return json({ erro: 'A IA não aceitou analisar estas fotos. Tente outras fotos do ambiente.' }, 422)
    if (resposta.stop_reason === 'max_tokens' || !resposta.parsed_output)
      return json({ erro: 'A IA não conseguiu terminar a leitura. Tente de novo, talvez com menos fotos.' }, 502)
    return json({ leitura: resposta.parsed_output })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: 'Chave da API da Anthropic inválida.' }, 500)
    if (e instanceof Anthropic.RateLimitError) return json({ erro: 'Muitos pedidos seguidos. Espere um minuto e tente de novo.' }, 429)
    if (e instanceof Anthropic.BadRequestError) return json({ erro: `Pedido recusado pela API: ${e.message}` }, 400)
    if (e instanceof Anthropic.APIError) return json({ erro: `Falha na API da IA (${e.status ?? 'sem status'}). Tente de novo.` }, 502)
    throw e
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/analisar' && req.method === 'POST') return analisar(req, env)
    if (url.pathname.startsWith('/api/')) return json({ erro: 'Não encontrado.' }, 404)
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
