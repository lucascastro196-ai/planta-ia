# Planta IA

Plataforma web para levantar a planta baixa de um ambiente com medidas reais. Funciona inteira no navegador, sem servidor e sem nenhum serviço pago.

## Como se mede

- **Contorno com a câmera (AR):** marque os cantos do piso com o celular e o cômodo sai pronto. Usa WebXR, então funciona no Chrome do Android com ARCore e precisa de https.
- **Parede por parede:** informe o comprimento de cada parede em cm e para que lado vira cada canto. O app fecha o polígono, repartindo a diferença entre as medidas sem tirar os cantos do esquadro, e mostra quanto faltou para fechar.
- **Medir na foto (qualquer celular):** com uma folha A4 ou um cartão encostado na parede, os 4 cantos da referência dão a escala (homografia) e qualquer distância naquele plano sai em cm.
- **Retângulo:** largura × profundidade.

Depois, no editor, dá para arrastar cantos e cômodos (eles se encaixam pelos cantos), editar paredes, portas e janelas e exportar em PDF (A4/A3, com escala e carimbo), DXF (AutoCAD, em metros) ou `.dae` (SketchUp: Arquivo → Importar).

## Rodar

```bash
bun install
bun run dev
```

O build (`bun run build`) gera um site estático em `dist/`, que pode ser hospedado em qualquer lugar gratuito com https (Cloudflare Pages, GitHub Pages, Netlify).

## Estrutura

- `src/lib/geometria.ts`: paredes, espessura, vãos, esticar parede.
- `src/lib/montar.ts`: paredes medidas ou contorno → cômodo fechado.
- `src/lib/homografia.ts`: medição na foto.
- `src/componentes/`: desenho técnico (SVG), editor, painel, novo cômodo, medidores (AR e foto).
- `src/lib/exportar/`: PDF, DXF e COLLADA.

## Testes

```bash
bun test testes
```
