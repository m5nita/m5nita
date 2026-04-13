# Feature Specification: Migração para Arquitetura Hexagonal com SOLID

**Feature Branch**: `010-hexagonal-architecture`
**Created**: 2026-04-12
**Status**: Draft
**Input**: User description: "Migrar a API backend (apps/api/src/) de uma arquitetura service-based para arquitetura hexagonal com SOLID. Criar camadas domain (entities, value objects, ports), application (use cases), e infrastructure (adapters Drizzle, Stripe, Telegram, HTTP routes). Introduzir value objects para primitivos de domínio (Money, EntryFee, InviteCode, Score, PixKey, MatchdayRange, PoolStatus). Migração incremental que mantém a API funcionando em cada fase. Domínios com tratamento completo: Pool, Prediction, Prize. Domínios simplificados: Match, Ranking, Competition, Coupon."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lógica de domínio isolada e testável (Priority: P1)

Como desenvolvedor, quero que as regras de negócio (cálculo de pontuação, transições de estado de bolão, cálculo de prêmio, validação de PIX) estejam encapsuladas em entidades e value objects puros, sem dependência de banco de dados ou frameworks, para que eu possa testá-las unitariamente com confiança total e sem setup de infraestrutura.

**Why this priority**: As regras de negócio são o coração da aplicação. Isolá-las garante que mudanças de infraestrutura (trocar ORM, gateway de pagamento) nunca quebrem a lógica central. Também reduz drasticamente o tempo de execução dos testes.

**Independent Test**: Pode ser validado criando value objects e entidades de domínio com testes unitários puros (sem mocks de banco ou HTTP). Se `Score.calculate(2, 1, 2, 1)` retorna 10 pontos e `Pool.close()` em um pool ativo muda o status para `closed`, a história está entregue.

**Acceptance Scenarios**:

1. **Given** um palpite de 2x1 e placar real de 2x1, **When** o sistema calcula a pontuação, **Then** retorna 10 pontos (acerto exato)
2. **Given** um palpite de 3x1 e placar real de 2x0, **When** o sistema calcula a pontuação, **Then** retorna 7 pontos (vencedor + saldo correto)
3. **Given** um palpite de 1x0 e placar real de 3x1, **When** o sistema calcula a pontuação, **Then** retorna 5 pontos (vencedor correto)
4. **Given** um palpite de 1x0 e placar real de 0x2, **When** o sistema calcula a pontuação, **Then** retorna 0 pontos (erro)
5. **Given** um valor monetário de 5000 centavos, **When** aplico taxa de 5%, **Then** obtenho 250 centavos de taxa
6. **Given** um bolão com status "active", **When** solicito o fechamento, **Then** o status muda para "closed"
7. **Given** um bolão com status "closed", **When** solicito o fechamento, **Then** o sistema rejeita com erro de estado inválido
8. **Given** um valor de entrada de 50 centavos, **When** tento criar um EntryFee, **Then** o sistema rejeita pois está abaixo do mínimo (R$1,00)
9. **Given** uma chave PIX do tipo CPF com 11 dígitos válidos, **When** crio o value object PixKey, **Then** a validação passa e a máscara esconde todos exceto os 4 últimos dígitos

---

### User Story 2 - Acesso a dados desacoplado via repositórios (Priority: P2)

Como desenvolvedor, quero que todas as consultas ao banco de dados sejam feitas através de interfaces de repositório (ports), implementadas por adaptadores específicos, para que a lógica de negócio não conheça detalhes de persistência e eu possa trocar ou mockar o acesso a dados facilmente.

**Why this priority**: Sem repositórios, use cases não podem ser testados isoladamente. Este é o pré-requisito para a User Story 3.

**Independent Test**: Pode ser validado criando uma interface de repositório e uma implementação concreta, verificando que os endpoints existentes continuam funcionando identicamente após a troca.

**Acceptance Scenarios**:

1. **Given** uma interface de repositório de Pool definida, **When** a implementação concreta é conectada, **Then** todos os endpoints de Pool retornam os mesmos dados que antes da migração
2. **Given** uma interface de repositório de Prediction definida, **When** busco palpites de um usuário em um bolão, **Then** os resultados incluem os dados do jogo associado
3. **Given** um repositório com dados existentes, **When** executo um teste usando uma implementação mockada da interface, **Then** o teste roda sem banco de dados e em menos de 10ms

---

### User Story 3 - Fluxos de negócio orquestrados por use cases (Priority: P3)

Como desenvolvedor, quero que cada operação de negócio (criar bolão, fazer palpite, solicitar saque de prêmio) seja representada por um use case dedicado que orquestra entidades, repositórios e serviços externos via ports, para que o código seja auto-documentado e cada fluxo tenha um ponto de entrada claro.

**Why this priority**: Use cases são a camada que conecta domínio e infraestrutura. Dependem das histórias 1 e 2.

**Independent Test**: Pode ser validado criando use cases que recebem ports via construtor e verificando que os endpoints chamam use cases ao invés de services diretos.

**Acceptance Scenarios**:

1. **Given** um use case de criação de bolão com ports injetados, **When** um usuário cria um bolão com cupom válido, **Then** o use case valida o cupom, cria a entidade Pool, persiste via repositório e inicia o pagamento via gateway
2. **Given** um use case de palpite com ports injetados, **When** um usuário faz um palpite antes do início do jogo, **Then** o use case valida a membership, verifica o horário do jogo e persiste o palpite
3. **Given** um use case de saque de prêmio, **When** um vencedor solicita o saque com chave PIX válida, **Then** o use case verifica elegibilidade, calcula o valor do prêmio, cria o pagamento e notifica o admin

---

### User Story 4 - Serviços externos abstraídos por ports (Priority: P4)

Como desenvolvedor, quero que integrações externas (pagamento, notificações, API de dados esportivos) sejam acessadas exclusivamente através de interfaces (ports), com implementações concretas trocáveis, para que eu possa testar fluxos sem depender de serviços externos e trocar provedores sem alterar lógica de negócio.

**Why this priority**: Complementa as histórias anteriores abstraindo os últimos pontos de acoplamento externo.

**Independent Test**: Pode ser validado verificando que testes de use case rodam com implementações mock de pagamento e notificação, e que em ambiente de desenvolvimento o mock de pagamento funciona sem provedor externo configurado.

**Acceptance Scenarios**:

1. **Given** um port de gateway de pagamento, **When** o sistema está em ambiente de desenvolvimento, **Then** uma implementação mock é usada e o bolão é ativado automaticamente
2. **Given** um port de gateway de pagamento, **When** o sistema está em produção, **Then** a implementação real cria sessões de checkout
3. **Given** um port de notificação, **When** um bolão é finalizado, **Then** os vencedores recebem notificação via o adaptador configurado

---

### User Story 5 - Migração transparente sem quebra de API (Priority: P5)

Como usuário final, quero continuar usando o aplicativo normalmente durante todo o processo de migração, sem notar mudanças no comportamento, desempenho ou respostas da API, para que a reestruturação interna não afete minha experiência.

**Why this priority**: Garante que a migração é segura. Cada fase deve ser retrocompatível.

**Independent Test**: Pode ser validado executando todos os testes existentes (116 testes) após cada fase de migração e verificando que nenhum falha.

**Acceptance Scenarios**:

1. **Given** a suíte de testes existente (116 testes), **When** uma fase de migração é completada, **Then** todos os testes passam sem modificação nos asserts (apenas nos imports se necessário)
2. **Given** um endpoint de criação de bolão, **When** chamado após a migração, **Then** o formato da resposta é idêntico ao anterior
3. **Given** o tempo de resposta atual dos endpoints, **When** comparado após a migração, **Then** não há degradação perceptível (variação menor que 20%)

---

### Edge Cases

- O que acontece quando um value object recebe um valor no limite (EntryFee de exatamente R$1,00 ou R$1.000,00)?
- Como o sistema trata a criação de um Pool com matchdayFrom sem matchdayTo (devem ser pareados ou ambos nulos)?
- O que acontece quando um use case recebe uma entidade com estado inválido para a operação (ex: cancelar um bolão já fechado)?
- Como o sistema trata uma falha do gateway de pagamento durante a criação de um bolão (rollback do pool criado)?
- O que acontece quando dois vencedores solicitam saque simultaneamente no mesmo bolão?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE organizar o código backend em três camadas distintas: domínio, aplicação e infraestrutura, com dependências apontando exclusivamente para dentro (infraestrutura → aplicação → domínio)
- **FR-002**: O sistema DEVE representar primitivos de domínio como value objects com validação embutida: valores monetários, taxas de entrada, códigos de convite, pontuações, chaves PIX, intervalos de rodada e status de bolão
- **FR-003**: O sistema DEVE encapsular regras de negócio em entidades de domínio com comportamento (transições de estado, cálculos de taxa, verificações de elegibilidade), não em serviços ou rotas
- **FR-004**: O sistema DEVE definir interfaces (ports) para todo acesso a dados e serviços externos, permitindo substituição de implementações sem alterar lógica de negócio
- **FR-005**: O sistema DEVE representar cada operação de negócio como um use case dedicado com um único método de execução
- **FR-006**: O sistema DEVE manter 100% de compatibilidade com o contrato de API existente (mesmos endpoints, mesmos formatos de resposta, mesmos códigos de erro)
- **FR-007**: O sistema DEVE permitir que a camada de domínio seja testada unitariamente sem nenhuma dependência de infraestrutura (sem banco, sem HTTP, sem serviços externos)
- **FR-008**: O sistema DEVE compor dependências manualmente em um ponto central de composição, sem framework de injeção de dependência
- **FR-009**: O sistema DEVE aplicar tratamento hexagonal completo (entidades, value objects, ports, use cases, adapters) para os domínios Pool, Prediction, Prize e Scoring. O domínio Match DEVE ter use cases para orquestração de sync (API externa → upsert → trigger scoring → close pools) mesmo sem entidade de domínio
- **FR-010**: O sistema DEVE aplicar tratamento simplificado (port de repositório + adapter) para os domínios Ranking, Competition e Coupon, sem criar entidades ou use cases quando a lógica for essencialmente CRUD
- **FR-011**: Background jobs DEVEM ser tratados como adaptadores de infraestrutura (equivalentes a routes HTTP) e DEVEM delegar toda lógica de negócio para use cases da application layer
- **FR-012**: O pacote compartilhado (`packages/shared`) DEVE coexistir com a camada de domínio: tipos de resposta da API e schemas de validação HTTP permanecem no shared; value objects com lógica de negócio vivem exclusivamente na camada de domínio

### Key Entities

- **Pool**: Bolão de apostas com ciclo de vida (pendente → ativo → fechado/cancelado), taxa de entrada, código de convite, competição associada e regras de fechamento automático
- **Prediction**: Palpite de um usuário para um jogo específico dentro de um bolão, com regra de bloqueio temporal (não pode alterar após início do jogo) e cálculo de pontuação
- **Prize**: Cálculo e distribuição de prêmios para vencedores de um bolão finalizado, incluindo divisão igualitária entre empatados e solicitação de saque via PIX
- **Score**: Resultado do cálculo de pontuação de um palpite comparado ao placar real, com quatro níveis (exato, saldo correto, vencedor correto, erro)
- **Money**: Valor monetário em centavos (BRL) com operações de percentual, subtração e divisão igualitária
- **EntryFee**: Valor de entrada de um bolão com limites mínimo e máximo definidos pelo negócio
- **InviteCode**: Código de 8 caracteres alfanuméricos para convite a bolões, excluindo caracteres ambíguos (0, 1, I, O)
- **PixKey**: Chave PIX com tipo (CPF, email, telefone, aleatória) e validação específica por tipo, com funcionalidade de mascaramento
- **PoolStatus**: Estado do ciclo de vida de um bolão com regras de transição (quais mudanças são permitidas a partir de cada estado)
- **MatchdayRange**: Intervalo de rodadas (de/até) que define o escopo de jogos de um bolão, com validação de pareamento

## Clarifications

### Session 2026-04-12

- Q: Em qual camada os background jobs (calcPoints, closePoolsJob, reminderJob) devem operar após a migração? → A: Jobs ficam na infrastructure como entry points (igual routes) e chamam use cases da application layer
- Q: Como tratar a coexistência entre packages/shared (tipos API, Zod) e value objects do domínio? → A: Coexistem — packages/shared mantém tipos de resposta da API e schemas Zod (fronteira HTTP); value objects do domínio são usados internamente na lógica de negócio

## Assumptions

- A migração será feita incrementalmente, uma fase por vez, sem big-bang rewrite
- Os testes existentes servem como rede de segurança e devem continuar passando após cada fase
- Domínios simples (Competition, Coupon) não justificam o overhead de entidades/use cases e mantêm uma estrutura mais leve
- As constantes de negócio em `packages/shared` permanecem como source of truth
- Validação de input HTTP continua na fronteira (rotas) usando as ferramentas existentes
- Não será adicionado framework de DI — a composição manual é suficiente para o tamanho do projeto
- Background jobs são adaptadores de infraestrutura (como routes) e delegam para use cases da application layer
- `packages/shared` coexiste com a camada de domínio: shared define tipos de resposta da API e schemas Zod para fronteira HTTP; value objects do domínio encapsulam lógica de negócio internamente

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos testes existentes (116+) passam após cada fase de migração, sem alteração nos asserts
- **SC-002**: Testes unitários de domain layer executam em menos de 50ms total (sem I/O)
- **SC-003**: Cobertura de testes da camada de domínio atinge 100% (entities, value objects, domain services)
- **SC-004**: Nenhum import de biblioteca de infraestrutura existe em arquivos da camada de domínio
- **SC-005**: Cada use case tem no máximo um método público e recebe todas dependências via construtor
- **SC-006**: O tempo de resposta dos endpoints não degrada mais que 20% comparado à baseline pré-migração
- **SC-007**: A migração pode ser pausada e retomada em qualquer fase sem deixar o sistema em estado inconsistente
