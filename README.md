# Planta IA

Plataforma web para gerar planta baixa a partir de fotos de um ambiente e de uma medida tirada com trena.

1. Para cada cômodo, envie de 4 a 8 fotos cobrindo todas as paredes e informe pelo menos uma medida (ex.: "parede da janela = 3,20 m").
2. A IA (Claude) devolve paredes, cantos, pé-direito, portas e janelas; o app fecha o polígono e desenha a planta com cotas.
3. Corrija o que precisar no editor: arraste os cantos, edite comprimentos, portas e janelas. Arraste os cômodos para montar a planta da casa; eles se encaixam pelos cantos.
4. Exporte em PDF (A4/A3, com escala e carimbo), DXF (AutoCAD, em metros) ou `.dae` (SketchUp: Arquivo → Importar).

## Rodar

```bash
bun install
cp .dev.vars.exemplo .dev.vars   # coloque sua ANTHROPIC_API_KEY
bun run dev
```

Sem a chave, o app funciona com o modo "Desenhar retângulo"; só a análise por fotos precisa dela.

## Estrutura

- `worker/index.ts`: Cloudflare Worker, rota `POST /api/analisar` (fotos + medidas → leitura estruturada do cômodo).
- `src/lib/leitura.ts`: esquema da resposta da IA (compartilhado entre Worker e app).
- `src/lib/montar.ts`: leitura → polígono fechado (reparte o erro de fechamento mantendo o esquadro).
- `src/lib/geometria.ts`: paredes, espessura, vãos, esticar parede.
- `src/componentes/`: desenho técnico (SVG), editor, painel do cômodo, formulário de fotos.
- `src/lib/exportar/`: PDF, DXF e COLLADA.

## Testes

```bash
bun test testes
```
