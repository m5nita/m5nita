# Feature Specification: Substituir Stripe por Mercado Pago Checkout Pro

**Feature Branch**: `012-stripe-to-mercadopago`  
**Created**: 2026-04-13  
**Status**: Draft  
**Input**: Substituir Stripe por Mercado Pago Checkout Pro (PIX + cartao com redirect e webhooks). Remover funcionalidade de reembolso (refund) de remocao de membros e cancelamento de boloes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pagamento de entrada no bolao via Mercado Pago (Priority: P1)

O participante cria um bolao ou aceita um convite e e redirecionado para a pagina de checkout do Mercado Pago, onde pode pagar com PIX, cartao de credito, boleto ou qualquer metodo suportado. Apos o pagamento ser confirmado, o participante e automaticamente registrado como membro do bolao.

**Why this priority**: Sem pagamento funcional, nenhum bolao pode ser criado ou ter membros — e o fluxo principal da aplicacao.

**Independent Test**: Pode ser testado criando um bolao com valor de entrada, sendo redirecionado ao Mercado Pago, completando o pagamento e verificando que o membro aparece no bolao.

**Acceptance Scenarios**:

1. **Given** um usuario autenticado cria um bolao com entrada de R$ 20,00, **When** o bolao e criado, **Then** o sistema gera uma preferencia de pagamento no Mercado Pago e redireciona o usuario para a URL de checkout.
2. **Given** o usuario completa o pagamento no Mercado Pago, **When** o webhook de pagamento aprovado e recebido, **Then** o status do pagamento e atualizado para "completed", o usuario e adicionado como membro do bolao e o bolao e ativado (se estava pendente).
3. **Given** o usuario abandona o checkout sem pagar, **When** a sessao de pagamento expira, **Then** o status do pagamento permanece "pending" e o usuario nao e adicionado ao bolao.

---

### User Story 2 - Entrar em bolao existente via convite com Mercado Pago (Priority: P1)

O participante acessa um link de convite de um bolao existente e e redirecionado para o Mercado Pago para pagar a entrada. Apos confirmacao do pagamento, e adicionado como membro do bolao.

**Why this priority**: Juntar-se a boloes via convite e tao essencial quanto criar — representa o fluxo principal para a maioria dos participantes.

**Independent Test**: Acessar um link de convite, ser redirecionado ao checkout, pagar e verificar que o usuario aparece na lista de membros do bolao.

**Acceptance Scenarios**:

1. **Given** um usuario acessa o link de convite de um bolao ativo, **When** clica para participar, **Then** e redirecionado ao checkout do Mercado Pago com o valor correto da entrada.
2. **Given** o pagamento e aprovado pelo Mercado Pago, **When** o webhook e recebido, **Then** o usuario e registrado como membro do bolao.

---

### User Story 3 - Remocao de codigo e funcionalidades do Stripe (Priority: P2)

Todo o codigo relacionado ao Stripe (SDK, gateway, configuracao, webhook) e removido do sistema. A dependencia `stripe` e desinstalada. Variaveis de ambiente do Stripe sao removidas.

**Why this priority**: Essencial para limpeza e manutencao, mas depende da implementacao do Mercado Pago estar funcional primeiro.

**Independent Test**: Verificar que nenhuma referencia ao Stripe existe no codigo-fonte, que o pacote `stripe` nao esta nas dependencias e que a aplicacao inicia sem variaveis de ambiente do Stripe.

**Acceptance Scenarios**:

1. **Given** o Mercado Pago esta integrado e funcional, **When** o codigo do Stripe e removido, **Then** a aplicacao compila e funciona normalmente sem nenhuma dependencia do Stripe.
2. **Given** o schema do banco de dados tem a coluna `stripe_payment_intent_id`, **When** a migracao e aplicada, **Then** a coluna e renomeada para um nome generico (ex: `external_payment_id`) que serve para o Mercado Pago.

---

### User Story 4 - Remocao da funcionalidade de reembolso (Priority: P2)

A funcionalidade de reembolso automatico e removida do sistema. Ao remover um membro de um bolao ou cancelar um bolao, nenhum reembolso e processado. O dono do bolao resolve reembolsos manualmente fora da plataforma, se necessario.

**Why this priority**: Decisao de negocio que simplifica o sistema. Pode ser implementada em paralelo com a migracao de gateway.

**Independent Test**: Remover um membro de um bolao e verificar que nenhuma chamada de reembolso e feita. Cancelar um bolao e verificar o mesmo.

**Acceptance Scenarios**:

1. **Given** o dono do bolao remove um membro, **When** a remocao e confirmada, **Then** o membro e removido do bolao sem nenhum reembolso automatico.
2. **Given** o dono cancela um bolao com membros pagos, **When** o cancelamento e confirmado, **Then** o bolao e cancelado e os membros sao removidos sem reembolso automatico.
3. **Given** a interface do PaymentGateway, **When** revisada apos a mudanca, **Then** o metodo `refund()` nao existe mais.

---

### Edge Cases

- O que acontece quando o webhook do Mercado Pago chega antes do redirect de sucesso? O sistema deve tratar o pagamento pelo webhook independentemente da navegacao do usuario.
- O que acontece se o mesmo webhook for enviado mais de uma vez? O sistema deve ser idempotente — pagamentos ja "completed" nao devem ser processados novamente.
- O que acontece se o usuario paga via PIX (aprovacao pode levar alguns segundos) vs. cartao (aprovacao instantanea)? O webhook deve tratar ambos os cenarios da mesma forma.
- O que acontece com pagamentos existentes que tem `stripe_payment_intent_id` no banco? Os dados historicos devem ser preservados na coluna renomeada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE criar uma preferencia de pagamento no Mercado Pago ao criar um bolao com valor de entrada, retornando a URL de checkout para redirect.
- **FR-002**: O sistema DEVE criar uma preferencia de pagamento no Mercado Pago ao participar de um bolao via convite, retornando a URL de checkout para redirect.
- **FR-003**: O sistema DEVE receber e processar webhooks do Mercado Pago para pagamentos aprovados, atualizando o status do pagamento e criando o membro do bolao.
- **FR-004**: O sistema DEVE validar a autenticidade dos webhooks recebidos do Mercado Pago (via header de assinatura ou secret).
- **FR-005**: O processamento de webhooks DEVE ser idempotente — processar o mesmo evento mais de uma vez nao deve causar duplicacao de membros ou erros.
- **FR-006**: O sistema DEVE remover completamente o metodo `refund()` da interface do PaymentGateway e todas as suas implementacoes.
- **FR-007**: O endpoint de remocao de membro DEVE continuar funcionando, mas sem acionar reembolso automatico.
- **FR-008**: O endpoint de cancelamento de bolao DEVE continuar funcionando, mas sem acionar reembolsos automaticos para os membros.
- **FR-009**: O sistema DEVE remover toda a dependencia do pacote `stripe` e seu codigo associado.
- **FR-010**: O schema do banco de dados DEVE renomear `stripe_payment_intent_id` para um nome generico que acomode o identificador do Mercado Pago.
- **FR-011**: O sistema DEVE continuar suportando o modo mock de pagamento para desenvolvimento local (sem credenciais do Mercado Pago).
- **FR-012**: A preferencia de pagamento DEVE incluir metadata com `userId`, `poolId` e `type` para rastreabilidade.
- **FR-013**: O sistema DEVE configurar URLs de sucesso e falha/cancelamento no checkout do Mercado Pago, redirecionando o usuario de volta a aplicacao.

### Key Entities

- **Payment**: Registro de pagamento com status (pending, completed, expired), valor, taxa da plataforma, ID externo do Mercado Pago, referencia ao usuario e bolao.
- **Preference (Mercado Pago)**: Objeto de preferencia criado via API do Mercado Pago contendo itens, valor, URLs de callback e metadata. Nao e persistido no banco — apenas o ID resultante e armazenado no Payment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos pagamentos de entrada passam pelo Mercado Pago Checkout Pro — nenhuma referencia ao Stripe permanece no fluxo ativo.
- **SC-002**: Participantes conseguem completar o pagamento de entrada em menos de 3 minutos usando PIX ou cartao de credito.
- **SC-003**: 100% dos webhooks de pagamento aprovado resultam na criacao correta do membro no bolao, sem duplicacoes.
- **SC-004**: A remocao de membros e o cancelamento de boloes funcionam sem erros, sem tentar processar reembolsos.
- **SC-005**: O modo de desenvolvimento mock continua funcional, permitindo testes sem credenciais externas.
- **SC-006**: Dados historicos de pagamento sao preservados apos a migracao do schema.

## Assumptions

- O Mercado Pago Checkout Pro suporta o modelo de redirect (redirecionar o usuario para o Mercado Pago e depois de volta para a aplicacao), que e analogo ao fluxo do Stripe Checkout.
- A conta do Mercado Pago ja esta criada e configurada com credenciais de acesso (access token).
- O webhook do Mercado Pago envia notificacao quando o pagamento e aprovado, permitindo atualizacao assincrona do status.
- Reembolsos, quando necessarios, serao tratados manualmente pelo dono do bolao fora da plataforma.
- A taxa da plataforma (5%) continua sendo a mesma, independente do gateway de pagamento.
- O valor do pagamento continua sendo em centavos (BRL) internamente, convertido para reais na hora de criar a preferencia no Mercado Pago.
