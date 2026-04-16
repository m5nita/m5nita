# Instagram Posts — Campanha m5nita

## Objetivo

Criar 5 posts para Instagram que chamem pessoas para acessar e testar o m5nita (plataforma de bolão esportivo). Cada post terá versão Feed (1080x1080) e Story (1080x1920).

## Identidade Visual

- **Fontes:** Barlow Condensed (títulos, ALL CAPS, bold) + Inter (corpo)
- **Cores:** Preto (#111111), Creme (#F5F0E8), Vermelho (#C4362A), Verde (#2D6A4F), Cinza (#8D8677)
- **Logo:** "M" branco em fundo preto com barra vermelha + texto "M5NITA"
- **Estilo:** Minimalista/Clean, fiel à identidade do produto
- **CTA:** m5nita.com
- **Idioma:** Português BR

## Posts

### Post 1 — Hero de Abertura (Tipografia Pura)
- **Fundo:** Creme (#F5F0E8)
- **Conteúdo:** Logo M5NITA no topo, barra vermelha, título "MONTE SEU BOLÃO" em Barlow Condensed 900 grande, barra vermelha separadora, subtítulo "Palpites, ranking e prêmio. Simples assim." em Inter, URL m5nita.com no rodapé em vermelho
- **Objetivo:** Apresentar o produto com a frase principal

### Post 2 — Como Funciona (Passo a Passo Numerado)
- **Fundo:** Preto (#111111)
- **Conteúdo:** Título "COMO FUNCIONA" em cinza, grid 2x2 com 4 cards escuros contendo:
  - 01 — Crie o bolão (Competição + valor)
  - 02 — Convide amigos (Compartilhe o código)
  - 03 — Faça seus palpites (Antes de cada jogo)
  - 04 — Leve o prêmio (1º lugar leva tudo)
- **Cada card:** Número grande em vermelho (opacidade 0.3) no canto, título em branco, descrição em cinza
- **Objetivo:** Educar o usuário sobre o fluxo do produto

### Post 3 — Antes vs Depois (Split)
- **Fundo:** Preto (#111111)
- **Conteúdo:** Tela dividida ao meio por linha vermelha
  - **Esquerda (ANTES):** Emoji 📱, "Bolão no grupo do WhatsApp", bullets: "Planilha confusa / Ninguém paga / Sem ranking" — tudo em cinza
  - **Direita (DEPOIS):** Emoji 🏆, "Bolão no m5nita", bullets: "Ranking automático / Pagamento seguro / Prêmio via Pix" — título em branco
- **Rodapé:** m5nita.com em vermelho centralizado
- **Objetivo:** Provocação comparativa, mostrar a dor e a solução

### Post 4 — Sistema de Pontos (Tipografia Pura)
- **Fundo:** Preto (#111111)
- **Conteúdo:** Título "SISTEMA DE PONTOS" em cinza, 3 números grandes lado a lado:
  - 10 (verde) — Placar exato
  - 7 (vermelho) — Vencedor + saldo
  - 5 (branco) — Vencedor certo
- **Barra vermelha separadora**, pergunta provocativa "QUANTO VALE SEU PALPITE?" em branco
- **Rodapé:** M5NITA em cinza
- **Objetivo:** Mostrar a mecânica de pontuação e provocar curiosidade

### Post 5 — CTA Final (Provocação + Conversão)
- **Fundo:** Creme (#F5F0E8)
- **Conteúdo:** Logo M5NITA no topo, barra vermelha, subtítulo "A PARTIR DE R$ 1,00" em cinza, título "SEU BOLÃO DA COPA COMEÇA AQUI" em preto bold, botão vermelho (#C4362A) com texto "COMEÇAR AGORA" em branco, URL m5nita.com no rodapé
- **Objetivo:** Conversão final — preço baixo como atrativo, urgência Copa 2026

## Formato de Entrega

Cada post será implementado como arquivo HTML standalone com dimensões exatas:
- **Feed:** 1080x1080px
- **Story:** 1080x1920px

Total: 10 arquivos HTML (5 feed + 5 story) na pasta `marketing/instagram/`.

O usuário pode abrir cada arquivo no navegador e fazer screenshot/exportar como PNG, ou usar ferramentas como Puppeteer para conversão automatizada.

## Padrões Técnicos

- Google Fonts (Barlow Condensed + Inter) carregadas via CDN
- CSS inline para garantir renderização consistente
- Viewport fixo via meta tag + body com dimensões exatas
- Sem dependências externas além das fontes
