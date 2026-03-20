# Feature Specification: Cupons de Desconto para Taxas de Bolão

**Feature Branch**: `003-discount-coupons`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "preciso criar uma forma de conseguir mudar as taxas na hora de criar um bolão, uma especie de cupons de desconto"

## Clarifications

### Session 2026-03-19

- Q: Como o sistema deve identificar quem é admin para gerenciar cupons? → A: Lista de IDs de admin via variável de ambiente (ADMIN_USER_IDS).
- Q: O desconto do cupom deve ser percentual sobre a taxa ou também permitir taxa fixa? → A: Somente percentual sobre a taxa padrão (1-100%).
- Q: Qual a interface para gestão de cupons? → A: Somente via comandos do bot Telegram (sem página web admin, sem API REST dedicada).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrador cria cupom via Telegram (Priority: P1)

O administrador da plataforma, identificado por variável de ambiente (ADMIN_USER_IDS), cria um cupom de desconto via comandos do bot Telegram. O cupom reduz a taxa da plataforma (atualmente 5%) cobrada sobre as entradas dos bolões. O cupom possui um código único, um percentual de desconto sobre a taxa, e opcionalmente uma data de expiração e um limite de usos.

**Why this priority**: Sem a capacidade de criar cupons, nenhuma outra funcionalidade de desconto pode existir. É o pré-requisito fundamental.

**Independent Test**: Pode ser testado enviando um comando de criação de cupom no Telegram e verificando que o bot confirma a criação com todos os atributos corretos.

**Acceptance Scenarios**:

1. **Given** um administrador autenticado no Telegram (user ID na lista ADMIN_USER_IDS), **When** ele envia um comando para criar um cupom com código "COPA2026", desconto de 100% na taxa e expiração em 30 dias, **Then** o cupom é criado com status ativo e o bot confirma a criação.
2. **Given** um administrador autenticado no Telegram, **When** ele tenta criar um cupom com um código que já existe, **Then** o bot rejeita a criação e informa que o código já está em uso.
3. **Given** um administrador autenticado no Telegram, **When** ele cria um cupom sem data de expiração e sem limite de usos, **Then** o cupom é criado como válido indefinidamente e sem limite de utilizações.
4. **Given** um usuário não-admin no Telegram, **When** ele tenta executar um comando de criação de cupom, **Then** o bot informa que ele não tem permissão.

---

### User Story 2 - Criador de bolão aplica cupom ao criar bolão (Priority: P1)

Ao criar um bolão, o usuário pode informar um código de cupom. Se o cupom for válido, a taxa da plataforma exibida é recalculada com o desconto aplicado. O cupom fica vinculado ao bolão.

**Why this priority**: Este é o caso de uso principal — o motivo pelo qual cupons existem. Tem a mesma prioridade que a criação porque juntos formam o MVP.

**Independent Test**: Pode ser testado criando um bolão com um cupom válido e verificando que a taxa da plataforma exibida reflete o desconto.

**Acceptance Scenarios**:

1. **Given** um cupom "COPA2026" ativo com 100% de desconto na taxa, **When** o usuário cria um bolão de R$ 50,00 e informa o código "COPA2026", **Then** a taxa da plataforma é R$ 0,00 (em vez de R$ 2,50) e o cupom fica vinculado ao bolão.
2. **Given** um cupom "METADE" ativo com 50% de desconto na taxa, **When** o usuário cria um bolão de R$ 100,00 e informa o código "METADE", **Then** a taxa da plataforma é R$ 2,50 (em vez de R$ 5,00).
3. **Given** um cupom expirado ou inválido, **When** o usuário tenta aplicar o código ao criar um bolão, **Then** o sistema informa que o cupom é inválido e a taxa permanece a padrão de 5%.
4. **Given** um cupom com limite de 10 usos e que já foi usado 10 vezes, **When** o usuário tenta aplicar esse cupom, **Then** o sistema informa que o cupom atingiu o limite de utilizações.

---

### User Story 3 - Taxa com desconto se aplica a todos os membros do bolão (Priority: P2)

Quando um bolão foi criado com um cupom de desconto, todos os participantes que entrarem nesse bolão pagam a taxa reduzida, não apenas o criador. O desconto é uma propriedade do bolão, não do pagamento individual.

**Why this priority**: Garante que o comportamento do cupom é consistente para todos os participantes do bolão, essencial para a experiência justa.

**Independent Test**: Pode ser testado convidando um segundo usuário para um bolão que tem cupom aplicado e verificando que a taxa cobrada é a reduzida.

**Acceptance Scenarios**:

1. **Given** um bolão criado com cupom de 100% de desconto na taxa e entry fee de R$ 50,00, **When** um novo membro entra pelo convite, **Then** a taxa cobrada ao novo membro é R$ 0,00.
2. **Given** um bolão criado sem cupom e entry fee de R$ 50,00, **When** um novo membro entra, **Then** a taxa cobrada é R$ 2,50 (5% padrão).

---

### User Story 4 - Administrador gerencia cupons via Telegram (Priority: P3)

O administrador pode listar cupons, desativar cupons ativos e ver métricas de uso (quantas vezes cada cupom foi utilizado) — tudo via comandos do bot Telegram.

**Why this priority**: É funcionalidade de gestão que agrega valor operacional, mas não é crítica para o fluxo principal de criação de bolões com desconto.

**Independent Test**: Pode ser testado listando cupons via Telegram, desativando um e verificando que ele não pode mais ser usado na criação de bolões.

**Acceptance Scenarios**:

1. **Given** um administrador autenticado no Telegram, **When** ele envia o comando para listar cupons, **Then** o bot retorna todos os cupons com código, desconto, status, usos realizados, limite de usos e data de expiração.
2. **Given** um cupom ativo, **When** o administrador envia o comando para desativar o cupom, **Then** ele não pode mais ser aplicado em novos bolões, mas bolões já criados com ele mantêm o desconto.

---

### Edge Cases

- O que acontece quando um cupom é desativado após um bolão ter sido criado com ele? O bolão mantém a taxa com desconto.
- O que acontece quando o desconto resulta em uma taxa de R$ 0,00? O pagamento é processado normalmente com taxa zero.
- O que acontece se o usuário informar um código com espaços ou letras minúsculas? O sistema normaliza o código (trim + uppercase) antes de validar.
- O que acontece se o cupom expirar entre a criação do bolão e a entrada de um novo membro? O bolão mantém o desconto porque ele foi vinculado na criação.
- O que acontece se dois cupons forem aplicados ao mesmo bolão? Apenas um cupom pode ser aplicado por bolão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir que administradores (identificados via ADMIN_USER_IDS) criem cupons via bot Telegram com: código único, percentual de desconto sobre a taxa (1% a 100%), data de expiração (opcional), e limite máximo de usos (opcional).
- **FR-002**: O sistema DEVE validar que códigos de cupom são únicos (case-insensitive) e compostos apenas de letras e números.
- **FR-003**: O sistema DEVE permitir que o usuário informe um código de cupom durante a criação de um bolão.
- **FR-004**: O sistema DEVE validar o cupom informado (existência, status ativo, dentro da data de validade, dentro do limite de usos) e calcular a taxa com desconto.
- **FR-005**: O sistema DEVE vincular o cupom ao bolão na criação, de forma que a taxa com desconto se aplique a todas as entradas daquele bolão.
- **FR-006**: O sistema DEVE incrementar o contador de usos do cupom quando ele for aplicado a um bolão.
- **FR-007**: O sistema DEVE normalizar códigos de cupom (remover espaços, converter para maiúsculas) antes de validar.
- **FR-008**: O sistema DEVE permitir que administradores desativem cupons via Telegram, impedindo novos usos sem afetar bolões existentes.
- **FR-009**: O sistema DEVE exibir ao usuário a taxa original e a taxa com desconto quando um cupom válido é aplicado, para transparência.
- **FR-010**: O sistema DEVE limitar a um único cupom por bolão.
- **FR-011**: O sistema DEVE rejeitar comandos de gestão de cupons de usuários não presentes na lista ADMIN_USER_IDS.
- **FR-012**: O tipo de desconto DEVE ser exclusivamente percentual sobre a taxa da plataforma (sem taxa fixa customizada).

### Key Entities

- **Cupom (Coupon)**: Representa um código de desconto. Atributos: código único, percentual de desconto sobre a taxa da plataforma (1-100%), status (ativo/inativo), data de expiração, limite de usos, contador de usos, data de criação.
- **Bolão (Pool)**: Já existente. Recebe uma referência opcional ao cupom aplicado, que determina a taxa efetiva para todas as entradas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administradores conseguem criar e gerenciar cupons via Telegram em menos de 1 minuto por operação.
- **SC-002**: Usuários conseguem aplicar um cupom durante a criação de um bolão em no máximo 1 passo adicional (digitar o código).
- **SC-003**: 100% dos pagamentos de entrada em bolões com cupom aplicado refletem a taxa com desconto correto.
- **SC-004**: Cupons expirados ou com limite atingido são rejeitados em 100% dos casos.
- **SC-005**: A experiência de criação de bolão sem cupom permanece inalterada — nenhum passo adicional obrigatório.
