# Feature Specification: Retirada de Premio pelo Vencedor

**Feature Branch**: `005-winner-prize-withdrawal`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: "criar forma do vencedor retirar seu premio apos bolao finalizar"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vencedor solicita retirada do premio (Priority: P1)

O vencedor do bolao (1o lugar no ranking) acessa a tela do bolao finalizado e solicita a retirada do premio. O sistema exibe o valor total do premio e solicita que o vencedor informe seus dados para recebimento (chave PIX). Apos confirmar, o sistema registra a solicitacao e o administrador da plataforma processa o pagamento manualmente.

**Why this priority**: Esta e a funcionalidade central da feature - sem ela, o vencedor nao tem como receber seu premio.

**Independent Test**: Pode ser testado criando um bolao com partidas finalizadas, verificando o ranking, e simulando a solicitacao de retirada pelo 1o colocado.

**Acceptance Scenarios**:

1. **Given** um bolao com status "closed" e todas as partidas finalizadas, **When** o vencedor (1o lugar) acessa a pagina do bolao, **Then** o sistema exibe um botao/opcao para solicitar a retirada do premio com o valor total visivel.
2. **Given** o vencedor clica em solicitar retirada, **When** ele informa sua chave PIX e confirma, **Then** o sistema registra a solicitacao de retirada com status "pending" e cria um registro de pagamento do tipo "prize".
3. **Given** um usuario que NAO e o vencedor acessa o bolao finalizado, **When** ele visualiza a pagina, **Then** ele nao ve a opcao de solicitar retirada.

---

### User Story 2 - Administrador do bolao finaliza o bolao (Priority: P2)

O dono (owner) do bolao pode finalizar/fechar o bolao quando todas as partidas associadas ja tiverem resultado. Ao finalizar, o ranking e congelado e o vencedor e determinado oficialmente.

**Why this priority**: O bolao precisa ser oficialmente finalizado antes que o premio possa ser retirado. Este e um pre-requisito para a US1.

**Independent Test**: Pode ser testado criando um bolao ativo com todas as partidas com resultado, e o owner finalizando o bolao.

**Acceptance Scenarios**:

1. **Given** um bolao ativo onde TODAS as partidas possuem resultado, **When** o owner clica em "Finalizar Bolao", **Then** o status do bolao muda para "closed" e o ranking final e registrado.
2. **Given** um bolao ativo onde algumas partidas ainda NAO possuem resultado, **When** o owner tenta finalizar o bolao, **Then** o sistema impede a acao e informa que ainda ha partidas pendentes.
3. **Given** um bolao ja finalizado, **When** o owner acessa a pagina, **Then** a opcao de finalizar nao esta mais disponivel.

---

### User Story 3 - Vencedor e notificado sobre o premio (Priority: P3)

Quando o bolao e finalizado, o vencedor recebe uma notificacao (via Telegram) informando que ele ganhou e pode solicitar a retirada do premio.

**Why this priority**: Melhora a experiencia do usuario mas nao bloqueia a funcionalidade principal de retirada.

**Independent Test**: Pode ser testado finalizando um bolao e verificando se a mensagem foi enviada via Telegram ao vencedor.

**Acceptance Scenarios**:

1. **Given** um bolao que acaba de ser finalizado, **When** o sistema determina o vencedor, **Then** uma notificacao via Telegram e enviada ao vencedor informando o valor do premio e instruindo-o a acessar o app para solicitar a retirada.
2. **Given** o vencedor nao possui chat do Telegram vinculado, **When** o bolao e finalizado, **Then** o sistema nao envia notificacao mas o vencedor ainda pode ver o premio ao acessar o app.

---

### Edge Cases

- O que acontece quando ha empate no 1o lugar do ranking? O premio e dividido igualmente entre todos os empatados. Cada um recebe sua fracao e pode solicitar a retirada individualmente.
- O que acontece se o vencedor informar uma chave PIX invalida? O sistema deve validar o formato da chave antes de registrar a solicitacao.
- O que acontece se o owner tentar cancelar um bolao apos o premio ja ter sido solicitado? A solicitacao de retirada deve bloquear o cancelamento.
- O que acontece se o bolao tiver apenas 1 membro? O premio e calculado normalmente (entrada menos taxa) e o unico membro e o vencedor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir que o owner finalize um bolao somente quando todas as partidas possuirem resultado.
- **FR-002**: O sistema DEVE mudar o status do bolao para "closed" ao ser finalizado, impedindo novas entradas e alteracoes de palpites.
- **FR-003**: O sistema DEVE exibir a opcao de retirada do premio para todos os vencedores (1o colocado, incluindo empates) de um bolao com status "closed".
- **FR-004**: O sistema DEVE permitir que o vencedor informe uma chave PIX (CPF, e-mail, telefone ou chave aleatoria) para recebimento do premio.
- **FR-005**: O sistema DEVE validar o formato da chave PIX informada antes de registrar a solicitacao.
- **FR-006**: O sistema DEVE criar um registro de pagamento do tipo "prize" com o valor total do premio ao registrar a solicitacao de retirada.
- **FR-007**: O sistema DEVE impedir que o bolao seja cancelado apos uma solicitacao de retirada ser registrada.
- **FR-008**: O sistema DEVE notificar o vencedor via Telegram quando o bolao for finalizado (quando o vencedor possuir chat vinculado).
- **FR-009**: O sistema DEVE impedir multiplas solicitacoes de retirada para o mesmo bolao.
- **FR-010**: O sistema DEVE bloquear a finalizacao do bolao se ainda houver partidas sem resultado.

### Key Entities

- **Prize Withdrawal (Solicitacao de Retirada)**: Representa a solicitacao do vencedor para receber o premio. Contem referencia ao bolao, ao vencedor, valor do premio, chave PIX informada, e status da solicitacao (pending, processing, completed, failed).
- **Pool (Bolao)**: Entidade existente que ganha a transicao para status "closed" como finalizacao oficial.
- **Payment (Pagamento)**: Entidade existente que ganha um novo registro do tipo "prize" quando a retirada e solicitada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O vencedor consegue solicitar a retirada do premio em menos de 2 minutos apos acessar o bolao finalizado.
- **SC-002**: 100% dos boloes finalizados possuem um vencedor determinado e visivel para todos os membros.
- **SC-003**: O vencedor recebe a notificacao via Telegram em ate 1 minuto apos a finalizacao do bolao.
- **SC-004**: Nenhum bolao pode ser finalizado com partidas pendentes (taxa de erro: 0%).
- **SC-005**: O fluxo de retirada e concluido com sucesso (solicitacao registrada) em 95% das tentativas na primeira vez.

## Assumptions

- O metodo de pagamento do premio sera via PIX, por ser o padrao no Brasil e o mais conveniente para os usuarios.
- Em caso de empate no 1o lugar, o premio e dividido igualmente entre os empatados. Cada empatado pode solicitar a retirada da sua fracao individualmente.
- O processamento real do PIX (transferencia bancaria) sera tratado manualmente pelo administrador da plataforma em um primeiro momento, com automacao sendo uma evolucao futura.
- A finalizacao do bolao e uma acao manual do owner, nao automatica.
