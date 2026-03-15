# Feature Specification: Manita — Bolao Copa do Mundo 2026

**Feature Branch**: `001-world-cup-pool-app`
**Created**: 2026-03-15
**Status**: Draft
**Input**: Especificacao completa do produto Manita (manita-spec.md)

## Clarifications

### Session 2026-03-15

- Q: Qual o valor maximo de entrada por bolao? → A: R$ 1.000,00
- Q: O bolao fecha automaticamente para novas entradas? → A: Nao, apenas manual pelo admin
- Q: Conformidade LGPD (dados pessoais e financeiros)? → A: Nao tratar agora, resolver em fase posterior
- Q: Numero minimo de participantes para o bolao ser valido? → A: Sem minimo (1 pessoa e valido)
- Q: Duracao da sessao do usuario? → A: 90 dias

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Autenticacao e Primeiro Acesso (Priority: P1)

Um usuario abre o Manita pela primeira vez. Ele informa seu numero de telefone, recebe um codigo OTP de 6 digitos via WhatsApp, digita o codigo no app e e autenticado. Como e sua primeira vez, o sistema pede que informe seu nome. Apos preencher, ele e levado a tela Home onde pode criar ou entrar em um bolao.

**Why this priority**: Sem autenticacao, nenhuma outra funcionalidade e acessivel. Este e o ponto de entrada obrigatorio de todo usuario.

**Independent Test**: Pode ser testado isoladamente — um usuario novo consegue autenticar e acessar a Home com seu nome exibido.

**Acceptance Scenarios**:

1. **Given** um usuario nao cadastrado, **When** informa telefone valido (+55, DDD, 9 digitos) e clica "Enviar codigo via WhatsApp", **Then** recebe um codigo OTP de 6 digitos via WhatsApp valido por 5 minutos.
2. **Given** um usuario com OTP recebido, **When** digita o codigo dentro de 5 min, **Then** e autenticado e redirecionado para a tela de Completar Perfil (se nome nao preenchido) ou Home.
3. **Given** um usuario autenticado sem nome, **When** preenche o campo de nome e confirma, **Then** o nome e salvo e ele e redirecionado para a Home.
4. **Given** um usuario ja cadastrado, **When** informa o mesmo telefone, **Then** recebe OTP e acessa a sessao existente.
5. **Given** um usuario que tenta solicitar OTP mais de 3 vezes em 5 minutos, **When** tenta novamente, **Then** recebe mensagem de rate limit.
6. **Given** um OTP expirado (>5 min), **When** o usuario tenta usa-lo, **Then** ve mensagem de erro e opcao de solicitar novo codigo.
7. **Given** um OTP ja utilizado, **When** o usuario tenta usa-lo novamente, **Then** ve mensagem de erro informando que o codigo ja foi usado.

---

### User Story 2 - Criar Bolao e Convidar Amigos (Priority: P1)

Um usuario autenticado decide criar um bolao. Ele preenche o nome do bolao, seleciona o valor da entrada (com opcoes pre-definidas ou valor personalizado), ve a taxa de 5% da plataforma, realiza o pagamento (Pix ou cartao), e apos confirmacao do pagamento o bolao e criado. Ele entao compartilha o link de convite via WhatsApp com seus amigos.

**Why this priority**: Criar bolao e o core da proposta de valor. Sem bolao, nao ha palpites nem competicao.

**Independent Test**: Um usuario consegue criar um bolao, pagar a entrada e obter um link de convite funcional para compartilhar.

**Acceptance Scenarios**:

1. **Given** um usuario autenticado na Home, **When** clica "Criar bolao", **Then** ve o formulario com nome, valor da entrada e quick-select de valores (R$ 20, R$ 50, R$ 100, R$ 200).
2. **Given** o formulario de criacao preenchido, **When** o usuario ve o resumo, **Then** a taxa de 5% e calculada e exibida automaticamente.
3. **Given** dados validos preenchidos, **When** clica "Criar e pagar R$ XX,00", **Then** e direcionado ao fluxo de pagamento com opcoes de Pix e cartao.
4. **Given** pagamento via Pix selecionado, **When** o QR code e exibido, **Then** um timer de 30 minutos e mostrado para expiracao.
5. **Given** pagamento confirmado, **When** o webhook de confirmacao e recebido, **Then** o bolao e criado, o usuario e adicionado como primeiro participante e admin, e a tela de convite e exibida.
6. **Given** o bolao criado, **When** o usuario ve a tela de convite, **Then** ve um ticket visual com QR code, botao "Compartilhar via WhatsApp" e "Copiar link do convite".
7. **Given** nome do bolao com menos de 3 ou mais de 50 caracteres, **When** tenta criar, **Then** ve mensagem de validacao.
8. **Given** valor de entrada menor que R$ 10,00, **When** tenta criar, **Then** ve mensagem de valor minimo.

---

### User Story 3 - Entrar em Bolao via Convite (Priority: P1)

Um usuario recebe um link de convite via WhatsApp. Ao clicar, e levado ao app onde ve as informacoes do bolao (nome, criador, participantes, valor, premio estimado). Se nao estiver autenticado, faz login primeiro e retorna ao convite. Ele paga a entrada e e adicionado ao bolao.

**Why this priority**: Sem a capacidade de entrar em boloes, a funcionalidade de criar bolao nao tem valor. Ambos formam o nucleo do produto.

**Independent Test**: Um usuario consegue acessar um link de convite, ver detalhes do bolao, pagar e ser adicionado como participante.

**Acceptance Scenarios**:

1. **Given** um usuario nao autenticado com link de convite, **When** abre o link, **Then** e redirecionado para login e apos autenticar retorna ao convite.
2. **Given** um usuario autenticado com link de convite valido, **When** abre o link, **Then** ve ticket com nome do bolao, criador, numero de participantes, valor da entrada e premio total estimado.
3. **Given** a tela de convite exibida, **When** clica "Pagar e entrar", **Then** e direcionado ao fluxo de pagamento.
4. **Given** pagamento confirmado, **When** o webhook e recebido, **Then** o usuario e adicionado como membro do bolao e redirecionado.
5. **Given** um bolao com isOpen = false, **When** o usuario abre o link de convite, **Then** ve mensagem "Este bolao nao aceita novas entradas".
6. **Given** um usuario que ja e membro do bolao, **When** abre o link de convite, **Then** ve mensagem "Voce ja participa deste bolao".
7. **Given** o premio total estimado, **When** exibido no convite, **Then** o valor e calculado como (entryFee * totalMembers) * 0.95.

---

### User Story 4 - Fazer Palpites na Fase de Grupos (Priority: P2)

Um membro de um bolao acessa a lista de jogos da fase de grupos, organizada por grupo (A-L). Para cada jogo, ele preenche seu palpite com o placar (gols de cada time). O palpite e salvo automaticamente. Ele pode editar ate o inicio do jogo.

**Why this priority**: Palpites sao o mecanismo central de competicao, mas dependem da existencia de boloes (P1) e da sincronizacao de jogos.

**Independent Test**: Um membro de bolao consegue visualizar jogos da fase de grupos, fazer palpites e ve-los salvos, e tenta editar apos inicio do jogo sem sucesso.

**Acceptance Scenarios**:

1. **Given** um membro de bolao, **When** acessa a tela de Palpites, **Then** ve jogos da fase de grupos organizados por grupo (A-L) com bandeiras, nomes dos times e data/hora.
2. **Given** um jogo agendado, **When** o usuario preenche o placar (home x away), **Then** o palpite e salvo automaticamente com debounce de 500ms.
3. **Given** um palpite salvo, **When** o usuario altera o placar antes do inicio do jogo, **Then** o palpite e atualizado.
4. **Given** um jogo que ja comecou, **When** o usuario tenta editar o palpite, **Then** os inputs sao desabilitados e uma mensagem indica que o jogo esta em andamento.
5. **Given** um jogo finalizado, **When** o usuario visualiza o palpite, **Then** ve o resultado final, seu palpite e os pontos ganhos.
6. **Given** inputs de placar, **When** o usuario tenta inserir valor negativo ou nao numerico, **Then** o sistema aceita apenas numeros >= 0.

---

### User Story 5 - Fazer Palpites no Mata-mata (Priority: P3)

Apos a fase de grupos, os jogos do mata-mata sao exibidos em um bracket visual (oitavas, quartas, semi, final). Os times sao preenchidos automaticamente conforme os resultados. O usuario faz palpites nos confrontos disponiveis.

**Why this priority**: Depende da conclusao da fase de grupos e da sincronizacao dos resultados. E uma extensao da funcionalidade de palpites.

**Independent Test**: Apos a fase de grupos, um usuario consegue visualizar o bracket com times reais e fazer palpites nos jogos de mata-mata.

**Acceptance Scenarios**:

1. **Given** a fase de grupos concluida, **When** o usuario acessa palpites de mata-mata, **Then** ve o bracket visual com times classificados.
2. **Given** um jogo de mata-mata com times definidos, **When** o usuario preenche o placar, **Then** o palpite e salvo automaticamente.
3. **Given** um jogo de mata-mata cujos times ainda nao foram definidos, **When** o usuario visualiza o bracket, **Then** os slots aparecem vazios (sem opcao de palpite).
4. **Given** as mesmas regras de prazo que a fase de grupos, **When** o jogo ja comecou, **Then** o palpite e travado.

---

### User Story 6 - Acompanhar Ranking e Resultados (Priority: P2)

Um membro de bolao acessa o ranking para ver sua posicao e a dos demais participantes. O ranking e atualizado apos cada jogo finalizado. Ele tambem pode ver o calendario de jogos com resultados e filtrar por fase e grupo.

**Why this priority**: O ranking e o mecanismo de engajamento e competicao. Sem ele, os palpites nao tem contexto competitivo.

**Independent Test**: Apos jogos finalizados, o ranking exibe a posicao correta de cada participante com base nos pontos acumulados.

**Acceptance Scenarios**:

1. **Given** um bolao com palpites e jogos finalizados, **When** o usuario acessa o Ranking, **Then** ve a lista ordenada por pontos (decrescente) com posicao, nome e pontos totais.
2. **Given** o ranking exibido, **When** o usuario logado esta na lista, **Then** sua posicao e destacada visualmente.
3. **Given** dois participantes com mesma pontuacao, **When** o ranking e calculado, **Then** o desempate e feito por maior numero de acertos de placar exato.
4. **Given** o ranking exibido, **When** o usuario puxa para baixo (pull-to-refresh), **Then** os dados sao atualizados.
5. **Given** a tela de Jogos, **When** o usuario filtra por fase ou grupo, **Then** apenas os jogos correspondentes sao exibidos.
6. **Given** um jogo ao vivo, **When** o usuario ve a lista de jogos, **Then** o jogo exibe indicador visual de "ao vivo".

---

### User Story 7 - Gerenciar Bolao como Admin (Priority: P3)

O criador (owner) de um bolao acessa a tela de gestao para administrar seu bolao. Ele pode editar o nome, ver participantes, remover membros (com reembolso automatico), bloquear novas entradas, reenviar convites e encerrar o bolao (reembolso total).

**Why this priority**: Funcionalidades administrativas sao importantes para a operacao do bolao, mas nao bloqueiam o fluxo principal de uso.

**Independent Test**: O admin consegue acessar a gestao, remover um participante com reembolso, e encerrar o bolao com reembolso para todos.

**Acceptance Scenarios**:

1. **Given** um usuario que e owner de um bolao, **When** acessa Detalhes do Bolao, **Then** ve o botao "Gerenciar bolao".
2. **Given** um usuario que NAO e owner, **When** acessa Detalhes do Bolao, **Then** NAO ve o botao de gerenciamento.
3. **Given** o admin na tela de gestao, **When** remove um participante, **Then** o reembolso do valor da entrada e processado automaticamente e o membro e removido.
4. **Given** o admin na tela de gestao, **When** clica "Bloquear novas entradas", **Then** isOpen muda para false e o link de convite e desabilitado.
5. **Given** o admin na tela de gestao, **When** encerra o bolao, **Then** todos os participantes recebem reembolso e o status muda para 'cancelled'.
6. **Given** um bolao onde ja houve distribuicao de premio, **When** o admin tenta encerrar, **Then** ve mensagem informando que nao e possivel encerrar.

---

### User Story 8 - Configuracoes e Perfil (Priority: P4)

O usuario acessa a tela de configuracoes para editar seu nome, ver seu telefone (somente leitura), gerenciar notificacoes, acessar ajuda e fazer logout.

**Why this priority**: Funcionalidade de suporte que nao bloqueia o uso principal do app.

**Independent Test**: O usuario consegue editar seu nome, desativar notificacoes e fazer logout com sucesso.

**Acceptance Scenarios**:

1. **Given** a tela de Configuracoes, **When** o usuario visualiza seus dados, **Then** ve nome (editavel) e telefone (somente leitura).
2. **Given** a tela de Configuracoes, **When** o usuario edita seu nome e salva, **Then** o novo nome e persistido e refletido em todo o app.
3. **Given** a tela de Configuracoes, **When** o usuario clica "Sair", **Then** a sessao e encerrada e ele e redirecionado para a tela de Login.
4. **Given** a tela de Configuracoes, **When** o usuario visualiza o rodape, **Then** ve a versao do app.

---

### Edge Cases

- O que acontece quando o pagamento Pix expira apos 30 minutos? O bolao nao e criado e o usuario e notificado para tentar novamente.
- O que acontece se a fonte de dados de jogos estiver indisponivel? O sistema usa os dados mais recentes em cache e exibe um aviso de dados potencialmente desatualizados.
- O que acontece se um usuario tenta fazer palpite em um jogo que comecou enquanto ele preenchia? A validacao server-side rejeita o palpite com base no matchDate.
- O que acontece se o processador de pagamento retorna erro no reembolso? O sistema registra o erro, marca o reembolso como pendente e notifica o admin para resolucao manual.
- O que acontece se dois usuarios empatam em pontos E em acertos exatos? Ambos compartilham a mesma posicao no ranking.
- O que acontece se um usuario tenta acessar um bolao cancelado? Ve mensagem informando que o bolao foi encerrado.
- O que acontece se o usuario digita o OTP em um dispositivo diferente do que solicitou? O codigo funciona normalmente — autenticacao nao e vinculada ao dispositivo.

## Requirements *(mandatory)*

### Functional Requirements

**Autenticacao**
- **FR-001**: O sistema DEVE permitir autenticacao via codigo OTP de 6 digitos enviado por WhatsApp usando numero de telefone.
- **FR-002**: O OTP DEVE expirar apos 5 minutos e ser de uso unico. A sessao autenticada DEVE durar 90 dias antes de exigir nova autenticacao.
- **FR-003**: O sistema DEVE aplicar rate limit de 3 solicitacoes de OTP por telefone a cada 5 minutos.
- **FR-004**: O sistema DEVE criar automaticamente uma conta quando um telefone novo e informado.
- **FR-005**: O sistema DEVE solicitar o nome do usuario na primeira autenticacao (quando nome nao preenchido).

**Bolao**
- **FR-006**: O sistema DEVE permitir que usuarios autenticados criem boloes com nome (3-50 caracteres) e valor de entrada (minimo R$ 10,00, maximo R$ 1.000,00).
- **FR-007**: O sistema DEVE cobrar taxa de 5% sobre cada entrada, exibida de forma transparente no momento da criacao e adesao.
- **FR-008**: O bolao DEVE ser criado somente apos confirmacao de pagamento da entrada do criador.
- **FR-009**: O sistema DEVE gerar um codigo de convite unico para cada bolao.
- **FR-010**: O sistema DEVE permitir compartilhamento do convite via WhatsApp com mensagem pre-formatada e via copia de link.

**Participacao**
- **FR-011**: O sistema DEVE permitir que usuarios entrem em boloes via link de convite, mediante pagamento da entrada.
- **FR-012**: O sistema DEVE bloquear entrada em boloes fechados (isOpen = false) ou para usuarios que ja sao membros. O fechamento e exclusivamente manual pelo admin — nao ha fechamento automatico.
- **FR-013**: O sistema DEVE exibir informacoes do bolao no convite (nome, criador, participantes, valor, premio estimado).
- **FR-014**: O sistema DEVE manter o contexto do convite caso o usuario precise autenticar antes de entrar.

**Pagamento**
- **FR-015**: O sistema DEVE aceitar pagamentos via Pix (com QR code e timer de 30 minutos) e cartao de credito.
- **FR-016**: O sistema DEVE processar reembolso automaticamente ao remover participante ou encerrar bolao.
- **FR-017**: O sistema DEVE calcular o premio total como (entryFee * totalMembers) * 0.95.
- **FR-018**: O premio DEVE ser destinado integralmente ao 1o lugar do ranking.

**Palpites**
- **FR-019**: O sistema DEVE permitir um unico palpite por jogo, por bolao, por usuario.
- **FR-020**: O sistema DEVE permitir edicao de palpites somente ate o horario de inicio do jogo (validacao server-side).
- **FR-021**: O sistema DEVE salvar palpites automaticamente com debounce de 500ms.
- **FR-022**: O sistema DEVE exibir jogos da fase de grupos organizados por grupo (A-L).
- **FR-023**: O sistema DEVE exibir jogos do mata-mata em formato de bracket visual.

**Pontuacao e Ranking**
- **FR-024**: O sistema DEVE calcular pontos automaticamente apos cada jogo finalizado: placar exato (10 pts), vencedor + diferenca (7 pts), vencedor correto (5 pts), empate correto (3 pts), errou (0 pts).
- **FR-025**: O sistema DEVE manter ranking atualizado por bolao, ordenado por pontos decrescentes.
- **FR-026**: O sistema DEVE usar numero de acertos de placar exato como criterio de desempate.

**Sincronizacao de Jogos**
- **FR-027**: O sistema DEVE sincronizar dados de jogos da Copa 2026 periodicamente (fixtures, resultados, horarios, grupos, bracket).
- **FR-028**: O sistema DEVE atualizar placares ao vivo durante jogos em andamento.

**Gestao (Admin)**
- **FR-029**: O sistema DEVE permitir que o owner do bolao edite nome, remova participantes (com reembolso), bloqueie entradas e encerre o bolao (com reembolso total).
- **FR-030**: O sistema DEVE impedir encerramento de bolao apos distribuicao de premio.

**Configuracoes**
- **FR-031**: O sistema DEVE permitir edicao do nome do usuario, mas NAO do telefone.
- **FR-032**: O sistema DEVE oferecer funcionalidade de logout que encerra a sessao.

### Key Entities

- **User**: Pessoa que usa o app. Identificada por telefone. Possui nome (preenchido apos primeiro acesso). Pode ser owner de boloes e participante de multiplos boloes.
- **Pool (Bolao)**: Competicao de palpites entre um grupo de pessoas. Possui nome, valor de entrada, codigo de convite, status (active/closed/cancelled) e um owner (admin). Sem minimo de participantes — um bolao com apenas o criador e valido.
- **PoolMember**: Vinculo entre usuario e bolao. Criado apos confirmacao de pagamento. Registra data de entrada.
- **Payment**: Transacao financeira. Pode ser entrada no bolao, reembolso ou premio. Registra valor, taxa da plataforma e status.
- **Match**: Jogo da Copa 2026. Sincronizado com fonte externa. Possui times, placar, fase, grupo, data/hora e status.
- **Prediction (Palpite)**: Palpite de um usuario para um jogo em um bolao. Registra placar previsto e pontos calculados. Constraint: um palpite por jogo por bolao por usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Usuarios conseguem se autenticar e acessar a Home em menos de 2 minutos no primeiro uso (incluindo receber magic link e preencher nome).
- **SC-002**: 95% dos usuarios conseguem criar um bolao e obter link de convite em menos de 3 minutos.
- **SC-003**: 90% dos usuarios convidados conseguem entrar no bolao na primeira tentativa ao clicar no link de convite.
- **SC-004**: O sistema suporta pelo menos 100 boloes simultaneos com ate 50 participantes cada sem degradacao perceptivel.
- **SC-005**: Palpites sao salvos e confirmados visualmente em menos de 2 segundos apos preenchimento.
- **SC-006**: O ranking e atualizado em ate 5 minutos apos o termino de um jogo.
- **SC-007**: 100% dos reembolsos sao processados em ate 24 horas apos a acao do admin.
- **SC-008**: O app e instalavel como PWA e funciona com navegacao fluida em dispositivos moveis.
- **SC-009**: 80% dos usuarios que criam um bolao convidam pelo menos uma pessoa nas primeiras 24 horas.
- **SC-010**: A taxa de abandono no fluxo de pagamento e inferior a 30%.

### Assumptions

- O formato da Copa do Mundo 2026 segue o modelo FIFA com 48 times: fase de grupos (12 grupos de 4) e mata-mata (32-avos, oitavas, quartas, semi, terceiro lugar, final).
- O mercado alvo inicial e exclusivamente Brasil (telefones +55, pagamentos em BRL, interface em portugues).
- A plataforma opera como intermediadora financeira usando servico de pagamento terceirizado para processar Pix e cartao.
- Notificacoes serao implementadas preferencialmente via WhatsApp (mesmo canal de autenticacao) ou como push notifications do PWA.
- O payout do premio para o vencedor sera realizado em uma fase posterior (V2), inicialmente com processo manual ou semi-automatizado.
- Conformidade LGPD (consentimento, exclusao de conta, politica de privacidade) sera tratada em fase posterior. Risco aceito para o MVP.
