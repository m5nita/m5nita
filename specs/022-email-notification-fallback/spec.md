# Feature Specification: Email fallback for Telegram notifications

**Feature Branch**: `022-email-notification-fallback`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "Preciso enviar e-mail de lembrete, igual ocorre por Telegram, em palpites faltando em jogos prestes a começar" (ampliado para incluir a notificação de vencedor do bolão).

## User Scenarios & Testing *(mandatory)*

Hoje o app notifica os usuários **apenas por Telegram**. Quem entrou por Google ou
magic-link tem só e-mail (sem telefone/Telegram vinculado) e, por isso, **não recebe
nenhuma notificação**. Esta feature adiciona o e-mail como **canal de fallback** para
as notificações voltadas ao usuário: lembrete de palpite e aviso de vitória.

A regra de canal é **um único canal por destinatário**: se o usuário tem Telegram
vinculado, recebe por Telegram; caso contrário, se tem e-mail verificado, recebe por
e-mail; caso contrário, não recebe. Ninguém recebe a mesma notificação em dois canais.

### User Story 1 - Lembrete de palpite por e-mail (Priority: P1)

Um participante que não tem Telegram vinculado, mas tem e-mail verificado, está em um
bolão com jogos prestes a começar e ainda não palpitou. Ele recebe um e-mail lembrando
de fazer os palpites antes do início, com a lista dos jogos pendentes e um link para a
tela de palpites do bolão.

**Why this priority**: É o pedido original e o caso de maior impacto — participantes sem
Telegram hoje simplesmente perdem o prazo por falta de aviso.

**Independent Test**: Em um bolão com um jogo começando dentro da janela de lembrete,
com um participante sem palpite, sem Telegram vinculado e com e-mail verificado:
disparar o ciclo de lembretes e confirmar que um e-mail de lembrete foi enviado para
esse participante (e que um participante equivalente com Telegram recebeu por Telegram,
não por e-mail).

**Acceptance Scenarios**:

1. **Given** um participante sem Telegram vinculado e com e-mail verificado, em um bolão
   com um jogo começando em breve e sem palpite registrado, **When** o ciclo de lembretes
   roda, **Then** ele recebe um e-mail de lembrete contendo o nome do bolão, a lista de
   jogos pendentes (com o tempo até o início) e um link para palpitar.
2. **Given** um participante com Telegram vinculado **e** e-mail verificado nas mesmas
   condições, **When** o ciclo de lembretes roda, **Then** ele recebe o lembrete **apenas
   por Telegram** e **nenhum** e-mail.
3. **Given** um participante sem Telegram e **sem** e-mail verificado, **When** o ciclo de
   lembretes roda, **Then** ele não recebe lembrete por nenhum canal.
4. **Given** um participante que já registrou palpite para o jogo, **When** o ciclo roda,
   **Then** ele não recebe lembrete (em nenhum canal).

---

### User Story 2 - Aviso de vitória por e-mail (Priority: P2)

Um vencedor de bolão que não tem Telegram vinculado, mas tem e-mail verificado, recebe,
no encerramento do bolão, um e-mail parabenizando-o, informando o valor do prêmio e com
um link para solicitar a retirada.

**Why this priority**: Importante para o ciclo de prêmio (o vencedor precisa saber para
solicitar a retirada), mas ocorre com menos frequência que os lembretes e depende do
encerramento do bolão.

**Independent Test**: Encerrar um bolão com um vencedor sem Telegram vinculado e com
e-mail verificado, e confirmar que o aviso de vitória chegou por e-mail com prêmio e
link de retirada; um vencedor equivalente com Telegram recebe por Telegram.

**Acceptance Scenarios**:

1. **Given** um bolão encerrado com um vencedor sem Telegram vinculado e com e-mail
   verificado, **When** o aviso de vencedores é disparado, **Then** ele recebe um e-mail
   contendo o nome do bolão, o valor do prêmio em reais e um link para solicitar a retirada.
2. **Given** um vencedor com Telegram vinculado, **When** o aviso é disparado, **Then** ele
   recebe **apenas por Telegram** e nenhum e-mail.
3. **Given** vários vencedores empatados em primeiro lugar, **When** o aviso é disparado,
   **Then** cada um recebe pelo seu próprio canal (Telegram ou e-mail).

---

### Edge Cases

- **Telefone sem Telegram vinculado, mas com e-mail verificado** → recebe por e-mail (o
  telefone existir não basta; o que conta é haver um Telegram realmente vinculado).
- **E-mail não verificado** → não recebe e-mail, mesmo que o endereço exista.
- **Sem telefone e sem e-mail verificado** → não recebe a notificação por nenhum canal.
- **Falha do provedor de e-mail (ou do Telegram) para um destinatário** → registra o erro
  e continua enviando aos demais destinatários do lote; uma falha individual nunca aborta
  o restante.
- **Link base do app indisponível** → o e-mail ainda é enviado, com instrução textual para
  acessar o app (sem botão de link quebrado).
- **Lembretes repetidos no mesmo ciclo** → o limite atual de no máximo um lembrete por
  participante por bolão por ciclo permanece, independentemente do canal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST entregar cada lembrete de palpite por **exatamente um canal**,
  escolhido nesta ordem: Telegram (se o participante tiver Telegram vinculado), senão
  e-mail (se tiver e-mail verificado), senão nenhum.
- **FR-002**: O sistema MUST considerar como candidatos a lembrete também os participantes
  **sem telefone/Telegram** que tenham e-mail verificado (hoje esses são ignorados).
- **FR-003**: O e-mail de lembrete MUST conter o nome do bolão, a lista de jogos pendentes
  (com o tempo até o início de cada um) e um link para a tela de palpites do bolão.
- **FR-004**: No encerramento de um bolão com vencedor(es), o sistema MUST notificar cada
  vencedor por **exatamente um canal**, seguindo a mesma regra de preferência do FR-001.
- **FR-005**: O e-mail de vitória MUST conter o nome do bolão, o valor do prêmio em reais
  (BRL) e um link para solicitar a retirada.
- **FR-006**: O sistema MUST enviar e-mails **somente para endereços verificados**.
- **FR-007**: Os e-mails MUST usar o visual da marca m5nita (consistente com o e-mail de
  acesso/magic-link existente) e o remetente oficial de notificações.
- **FR-008**: Uma falha de entrega para um destinatário NÃO MUST impedir o envio aos demais
  destinatários do mesmo lote.
- **FR-009**: O sistema MUST preservar o comportamento atual do Telegram para quem tem
  Telegram vinculado — sem duplicar a mesma notificação por e-mail.
- **FR-010**: A notificação de **pedido de retirada para administradores** e o **OTP de
  login** permanecem **apenas no Telegram** (fora do escopo de e-mail).
- **FR-011**: O comportamento de deduplicação de lembretes (no máximo um lembrete por
  participante por bolão por ciclo) MUST permanecer inalterado, independentemente do canal.

### Key Entities

- **Notificação de lembrete**: destinatário (contato do participante), bolão e a lista de
  jogos pendentes prestes a começar.
- **Notificação de vitória**: destinatário (contato do vencedor), bolão e valor do prêmio.
- **Contato do usuário**: meios de alcance do usuário — telefone (que pode estar vinculado
  a um chat do Telegram) e e-mail (verificado ou não). A elegibilidade de canal deriva
  deste contato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos participantes elegíveis a lembrete que **não** têm Telegram vinculado
  mas têm e-mail verificado recebem o lembrete por e-mail no mesmo ciclo em que hoje apenas
  usuários de Telegram seriam alcançados.
- **SC-002**: 0 notificações duplicadas — nenhum usuário recebe a mesma notificação por
  Telegram **e** e-mail.
- **SC-003**: 100% dos vencedores sem Telegram vinculado e com e-mail verificado recebem o
  aviso de vitória por e-mail ao encerrar o bolão.
- **SC-004**: 0 e-mails enviados para endereços não verificados.
- **SC-005**: Nenhuma regressão nas notificações que permanecem só no Telegram (pedido de
  retirada para admin e OTP de login continuam 100% por Telegram).

## Assumptions

- Logins por Google e por magic-link já produzem e-mail verificado; logins só por telefone
  (Telegram OTP) podem não ter e-mail — daí a regra de fallback por preferência.
- "Telegram vinculado" significa existir um chat do Telegram associado ao telefone do
  usuário; ter telefone cadastrado, por si só, não garante Telegram vinculado.
- A janela de tempo dos lembretes (jogos começando em até ~1h) e a frequência do ciclo
  (a cada 15 min) permanecem as mesmas de hoje; esta feature não as altera.
- O envio de e-mail reutiliza o provedor de e-mail já existente no projeto; **nenhuma nova
  dependência** e **nenhuma mudança de schema/banco** são necessárias.

## Out of Scope

- Preferências de notificação por usuário (escolher canal, desativar, etc.).
- Fallback de e-mail para a notificação de pedido de retirada (admin) e para o OTP de login.
- Alterações na janela/frequência dos lembretes ou na lógica de deduplicação existente.
- Reenvio/retentativa de e-mails que falharem (segue o mesmo modelo "log e continua" do
  Telegram atual).
