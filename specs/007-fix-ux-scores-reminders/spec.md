# Feature Specification: Correções de UX - Lembretes, Pontuação e Bolões Finalizados

**Feature Branch**: `007-fix-ux-scores-reminders`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: Correções de UX incluindo: lembrete Telegram com nome/link do bolão, pontuação de textos em PT-BR, exibir palpite junto com resultado ao vivo/finalizado, corrigir descrição da regra de 5 pontos, e mostrar bolões finalizados na tela inicial.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualizar palpite junto com resultado real em jogos ao vivo/finalizados (Priority: P1)

Como participante de um bolão, quando acesso a página de palpites e um jogo está ao vivo ou já finalizou, quero ver tanto o placar real quanto o meu palpite original, para que eu possa acompanhar como meu palpite se compara ao resultado.

Atualmente, quando o jogo começa ou finaliza, os campos de entrada são substituídos pelo placar real, e o palpite do usuário desaparece completamente. O usuário perde a referência do que havia palpitado.

**Why this priority**: Este é o problema mais impactante para a experiência do usuário. Os participantes perdem visibilidade do próprio palpite durante e após os jogos, o que é a funcionalidade central do app.

**Independent Test**: Pode ser testado acessando a página de palpites de qualquer bolão que tenha jogos ao vivo ou finalizados e verificando que ambos os placares são visíveis.

**Acceptance Scenarios**:

1. **Given** um jogo ao vivo onde o usuário fez um palpite de 2x1 e o placar real é 1x0, **When** o usuário acessa a página de palpites, **Then** o sistema exibe o placar real (1x0) e o palpite do usuário (2x1) de forma claramente distinguível.
2. **Given** um jogo finalizado com placar 3x2 e palpite do usuário de 1x0, **When** o usuário acessa a página de palpites, **Then** o sistema exibe o placar real (3x2), o palpite do usuário (1x0) e a pontuação obtida (ex: "+7 pts").
3. **Given** um jogo finalizado onde o usuário não fez palpite, **When** o usuário acessa a página de palpites, **Then** o sistema exibe o placar real e indica que nenhum palpite foi registrado.
4. **Given** um jogo agendado (ainda não começou), **When** o usuário acessa a página de palpites, **Then** o comportamento permanece o mesmo (campos editáveis para registrar palpite).

---

### User Story 2 - Visualizar bolões finalizados na tela inicial (Priority: P1)

Como participante, quero poder ver os bolões que já foram finalizados na tela inicial do app, para consultar minha posição final no ranking, pontuação e histórico.

Atualmente, quando um bolão/competição é finalizado, ele desaparece completamente da tela inicial, impedindo o acesso ao histórico.

**Why this priority**: Usuários perdem acesso a informações importantes (ranking final, pontuação, histórico de palpites) quando a competição termina. Isso afeta a confiança no sistema e a experiência pós-competição.

**Independent Test**: Pode ser testado finalizando uma competição e verificando que os bolões associados continuam visíveis na tela inicial, em uma seção separada.

**Acceptance Scenarios**:

1. **Given** o usuário participa de bolões ativos e finalizados, **When** acessa a tela inicial, **Then** vê os bolões ativos em destaque e os bolões finalizados em uma seção separada (ex: "Finalizados").
2. **Given** o usuário tem apenas bolões finalizados, **When** acessa a tela inicial, **Then** vê a seção de finalizados com seus bolões e uma mensagem indicando que não há bolões ativos.
3. **Given** um bolão finalizado é exibido na tela inicial, **When** o usuário clica nele, **Then** é redirecionado para a página do bolão com ranking final, pontuação e histórico de palpites.
4. **Given** um bolão finalizado, **When** exibido na tela inicial, **Then** mostra uma indicação visual clara de que está finalizado (ex: badge "Finalizado").

---

### User Story 3 - Lembrete no Telegram com nome do bolão e link direto (Priority: P2)

Como participante de um bolão, quando recebo um lembrete no Telegram sobre palpites faltando, quero que a mensagem inclua o nome do bolão e um link direto para a página de palpites, para que eu saiba de qual bolão se trata e acesse rapidamente.

Atualmente, a mensagem contém apenas o nome dos times e um texto genérico pedindo para acessar o app, sem identificar o bolão ou fornecer link.

**Why this priority**: Melhora significativamente a conversão do lembrete em ação. O usuário precisa saber de qual bolão se trata (pode participar de vários) e ter acesso rápido.

**Independent Test**: Pode ser testado simulando o envio de um lembrete e verificando que a mensagem contém o nome do bolão e o link correto.

**Acceptance Scenarios**:

1. **Given** um usuário com palpites faltando no bolão "Copa do Mundo 2026", **When** o lembrete é enviado via Telegram, **Then** a mensagem contém o nome "Copa do Mundo 2026" e um link que direciona para a página de palpites desse bolão.
2. **Given** um usuário com palpites faltando em múltiplos bolões, **When** os lembretes são enviados, **Then** cada mensagem identifica claramente qual bolão se refere com nome e link correspondente.
3. **Given** o link do lembrete, **When** o usuário clica nele, **Then** é redirecionado diretamente para a página de palpites do bolão específico (e não para a tela inicial).

---

### User Story 4 - Corrigir texto da regra de pontuação de 5 pontos (Priority: P2)

Como participante, quero que a descrição das regras de pontuação seja precisa, para que eu entenda corretamente como os pontos são calculados.

O texto atual sobre a regra de 5 pontos está incorreto. Exemplo: se o palpite for 1x0 e o resultado for 3x2, o usuário acertou o vencedor E a diferença de gols (ambos têm diferença de 1), o que deveria pontuar 7 pontos (acerto de vencedor + diferença), não 5.

**Why this priority**: Informação incorreta sobre as regras gera confusão e desconfiança no sistema de pontuação. A lógica de cálculo está correta no backend, mas a explicação ao usuário está errada.

**Independent Test**: Pode ser testado acessando a página de regras ("Como funciona") e verificando que os exemplos e descrições estão matematicamente corretos e condizentes com a lógica real.

**Acceptance Scenarios**:

1. **Given** a página de regras de pontuação, **When** o usuário visualiza a explicação da regra de 5 pontos (acertar o vencedor), **Then** os exemplos apresentados são matematicamente corretos e não se confundem com a regra de 7 pontos.
2. **Given** a página de regras de pontuação, **When** o usuário visualiza a explicação da regra de 7 pontos (acertar vencedor + diferença de gols), **Then** o exemplo mostra claramente que palpites como 1x0 com resultado 3x2 se encaixam nessa categoria (diferença de 1 gol em ambos).
3. **Given** todas as regras de pontuação exibidas, **When** comparadas com a lógica real de cálculo do sistema, **Then** todas as descrições e exemplos estão 100% consistentes.

---

### User Story 5 - Padronizar pontuação em textos em português (Priority: P3)

Como usuário do app, quero que todos os textos em português tenham pontuação correta (pontos finais, acentos, vírgulas), para uma experiência profissional e legível.

Diversos textos no sistema estão sem acentuação adequada ou pontuação final, tanto no app quanto nas mensagens do Telegram.

**Why this priority**: Embora não afete funcionalidade, textos sem pontuação adequada passam uma impressão de falta de cuidado e podem confundir usuários em mensagens mais longas.

**Independent Test**: Pode ser testado revisando todas as strings visíveis ao usuário no app e nas mensagens do Telegram, verificando conformidade com regras de português.

**Acceptance Scenarios**:

1. **Given** qualquer texto visível ao usuário no app (mensagens, labels, placeholders), **When** exibido, **Then** possui acentuação correta conforme gramática portuguesa (ex: "não" em vez de "nao", "Você" em vez de "Voce").
2. **Given** qualquer mensagem enviada via Telegram (lembretes, OTP, notificações), **When** enviada, **Then** possui pontuação completa (pontos finais, vírgulas, acentos).
3. **Given** mensagens de erro retornadas pelo sistema, **When** exibidas ao usuário, **Then** possuem pontuação e acentuação corretas.

---

### Edge Cases

- O que acontece quando um jogo ao vivo não tem palpite do usuário? Deve exibir o placar real e indicar "Sem palpite".
- O que acontece quando o usuário participa de muitos bolões finalizados? A seção de finalizados deve ter scroll ou limite visual para não poluir a tela.
- O que acontece se o link do bolão no lembrete Telegram for acessado por alguém não logado? O usuário deve ser redirecionado para login e depois para o bolão.
- O que acontece com bolões finalizados sem jogos pontuados (cancelados)? Devem ser exibidos com indicação de status adequada.

## Clarifications

### Session 2026-04-06

- Q: Qual a hierarquia visual ao exibir palpite e placar real juntos em jogos ao vivo/finalizados? → A: Palpite do usuário em destaque (elemento principal), placar real exibido menor acima (secundário). O foco permanece no palpite do usuário.
- Q: Como agrupar mensagens de lembrete Telegram para usuário com palpites faltando em múltiplos bolões? → A: Uma mensagem por bolão, agrupando todos os jogos com palpites faltando daquele bolão em uma única mensagem com link direto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE exibir o palpite original do usuário junto com o placar real quando um jogo estiver ao vivo ou finalizado na página de palpites.
- **FR-002**: O sistema DEVE exibir o palpite do usuário como elemento principal (destaque) e o placar real como elemento secundário (menor, posicionado acima do palpite).
- **FR-003**: O sistema DEVE exibir bolões finalizados na tela inicial, separados dos bolões ativos, em uma seção identificada como "Finalizados" ou equivalente.
- **FR-004**: O sistema DEVE permitir que o usuário acesse um bolão finalizado e visualize ranking final, pontuação e histórico de palpites.
- **FR-005**: O lembrete de palpite enviado via Telegram DEVE incluir o nome do bolão na mensagem.
- **FR-006**: O lembrete de palpite enviado via Telegram DEVE incluir um link direto para a página de palpites do bolão correspondente.
- **FR-011**: O sistema DEVE agrupar os lembretes por bolão, enviando uma única mensagem por bolão contendo todos os jogos com palpites faltando.
- **FR-007**: O sistema DEVE corrigir a descrição da regra de pontuação de 5 pontos na página de regras, garantindo que os exemplos estejam corretos e não se confundam com a regra de 7 pontos.
- **FR-008**: Todos os textos visíveis ao usuário (app e Telegram) DEVEM seguir regras de pontuação e acentuação da língua portuguesa.
- **FR-009**: O sistema DEVE exibir indicação visual clara do status "Finalizado" em bolões que já encerraram.
- **FR-010**: Quando um jogo estiver ao vivo ou finalizado e o usuário não tiver feito palpite, o sistema DEVE exibir o placar real com indicação de "Sem palpite".

## Assumptions

- O link direto para o bolão seguirá o padrão de URL já existente no app (ex: `/pools/{poolId}/predictions`).
- A seção de bolões finalizados na tela inicial será colapsável ou terá limite visual para não dominar a interface quando houver muitos finalizados.
- A revisão de textos em português cobrirá tanto o frontend (app web) quanto mensagens do backend (Telegram, erros de API visíveis ao usuário).
- A lógica de cálculo de pontuação no backend está correta; apenas a descrição/exemplos na UI precisam ser corrigidos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos jogos ao vivo e finalizados exibem tanto o placar real quanto o palpite do usuário na página de palpites.
- **SC-002**: 100% dos bolões finalizados dos quais o usuário participa são visíveis na tela inicial.
- **SC-003**: 100% dos lembretes de palpite via Telegram incluem nome do bolão e link direto funcional.
- **SC-004**: 100% das descrições de regras de pontuação estão consistentes com a lógica real de cálculo.
- **SC-005**: 100% dos textos visíveis ao usuário (app e Telegram) seguem regras de pontuação e acentuação da língua portuguesa.
- **SC-006**: Usuários conseguem acessar um bolão finalizado e visualizar ranking/pontuação em menos de 3 toques a partir da tela inicial.
