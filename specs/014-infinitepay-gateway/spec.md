# Feature Specification: InfinitePay Payment Gateway

**Feature Branch**: `014-infinitepay-gateway`
**Created**: 2026-04-16
**Status**: Draft
**Input**: User description: "preciso adicionar um novo gateway de pagamento: infinitepay. Aqui está a documentação: https://www.infinitepay.io/checkout"

## Clarifications

### Session 2026-04-16

- Q: Does InfinitePay handle only entry payments, also winner payouts, or payout reconciliation? → A: Entry payments only — winner payouts remain outside the gateway (manual / direct PIX / existing flow), so the platform's payment gateway port stays unchanged.
- Q: How are entry funds settled — single operator account, real-time split, or two-step billing? → A: Single operator InfinitePay account receives 100% of every entry payment; the recorded platform fee is an accounting figure only and is not split at payment time.
- Q: How is webhook authenticity established — active confirmation, HMAC signature, shared secret, or layered defense? → A: Active confirmation — incoming webhooks are treated as untrusted triggers; the platform queries InfinitePay's payment-check endpoint with the referenced payment identifier and trusts only the status returned by that authoritative call. Mirrors the existing MercadoPago pattern.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator deploys the platform with InfinitePay as the active gateway (Priority: P1)

The platform operator selects InfinitePay as the active payment provider at deployment time so that all subsequent pool entry payment flows route through InfinitePay instead of (or alongside, on a separate deployment) the previously available providers. This unlocks InfinitePay-specific advantages — namely lower fees for PIX, fast settlement, and the operator's existing InfinitePay merchant account — without requiring a code change for each switch.

**Why this priority**: Without the deployment-time selection working, no other story can be delivered. It is the foundation that makes InfinitePay reachable from any user-facing flow.

**Independent Test**: Configure the platform with InfinitePay credentials and the gateway selector set to "infinitepay", then start the platform. The platform must start successfully, report that InfinitePay is the active gateway in its operational health surface, and reject startup if InfinitePay credentials are missing in a production-style environment.

**Acceptance Scenarios**:

1. **Given** the operator has a valid InfinitePay merchant identifier and webhook secret, **When** they deploy the platform with InfinitePay selected, **Then** the platform starts successfully and reports InfinitePay as the active gateway.
2. **Given** the operator selects InfinitePay but omits the required credentials in a production-style environment, **When** they attempt to start the platform, **Then** the platform refuses to start and clearly identifies which credentials are missing.
3. **Given** the operator selects InfinitePay in a local development environment without credentials, **When** they start the platform, **Then** the platform starts using a non-charging mock gateway and clearly signals that no real payments will be processed.

---

### User Story 2 - Customer pays a pool entry through InfinitePay checkout (Priority: P1)

A customer joining or creating a pool is sent to an InfinitePay-hosted checkout page where they can pay with PIX, credit card (with installments), or boleto. After completing the payment they are returned to the platform's existing payment confirmation page and, once their payment is confirmed by InfinitePay, their pool membership becomes active.

**Why this priority**: This is the end-to-end revenue path. It is the reason the operator chose to add InfinitePay in the first place. Without it, the gateway has no real-world value.

**Independent Test**: With InfinitePay configured as the active gateway, a customer initiates a pool entry, is redirected to an InfinitePay checkout page that lists PIX, credit card, and boleto, completes a payment, lands back on the platform's confirmation page, and sees their pool membership become active within one minute of paying.

**Acceptance Scenarios**:

1. **Given** InfinitePay is the active gateway and a customer chooses to join a paid pool, **When** the customer confirms the join action, **Then** they are redirected to an InfinitePay-hosted checkout page that displays the correct amount in BRL.
2. **Given** the customer is on the InfinitePay checkout page, **When** they look at available payment methods, **Then** they see PIX, credit card (with installment options), and boleto.
3. **Given** the customer has known contact details on file (name, email, and phone if present), **When** they arrive at the InfinitePay checkout page, **Then** those details are pre-filled to reduce friction.
4. **Given** the customer completes a successful payment, **When** the InfinitePay flow finishes, **Then** they are redirected to the platform's existing payment confirmation page.
5. **Given** the customer abandons the InfinitePay checkout, **When** they return to the platform, **Then** their pool membership is not activated and they may retry payment from the original pool entry surface.

---

### User Story 3 - Platform reliably reflects InfinitePay payment status (Priority: P1)

When InfinitePay confirms (or fails to confirm) a payment, the platform updates the corresponding pool entry promptly and reliably, even if InfinitePay delivers the same notification more than once or out of order. The customer's pool membership is activated exactly once for each successful payment, and unsuccessful payments leave the customer in a state from which they can retry.

**Why this priority**: Without trustworthy status reconciliation, customers either lose access despite paying, or gain access without paying, or get duplicated memberships. This is the integrity backbone of the integration.

**Independent Test**: Trigger a successful InfinitePay payment notification for a pending pool entry; the entry must transition to active and the customer must gain pool membership. Re-deliver the same notification — the membership must remain a single record, no duplicate membership is created, and the payment record stays in the completed state.

**Acceptance Scenarios**:

1. **Given** a pending pool entry payment exists, **When** InfinitePay sends an authentic confirmation notification, **Then** the platform marks the payment as completed and activates the customer's pool membership.
2. **Given** a payment has already been marked completed, **When** InfinitePay re-delivers the same confirmation, **Then** the platform recognizes the duplicate and makes no further changes (no duplicate membership, no duplicate side effects).
3. **Given** an inbound notification arrives whose referenced payment cannot be confirmed against InfinitePay's authoritative payment-status endpoint, **When** the platform processes it, **Then** the notification is rejected and the payment record is unchanged.
4. **Given** InfinitePay reports a payment as failed, expired, or rejected, **When** the platform receives that notification, **Then** the payment record is updated accordingly and the customer is not granted pool membership.

---

### Edge Cases

- **InfinitePay outage during checkout creation**: If InfinitePay's API is unreachable when the customer tries to start payment, the customer must see a clear, actionable error message rather than a blank screen, and no orphan payment record should remain blocking retry.
- **Webhook arrives before checkout-link response is persisted**: The payment must still be reconcilable; the platform must not lose a paid event because the create-link call had not yet completed locally.
- **Webhook arrives much later (hours/days)**: A late notification for a still-pending payment must still complete the entry; a notification for an entry that has been independently cancelled must be ignored without errors.
- **Customer pays but never returns to the success page**: Membership activation must not depend on the customer returning to the platform; it must depend solely on the result of the platform's payment-status confirmation call to InfinitePay.
- **Two notifications for the same payment with conflicting statuses**: The platform must apply a deterministic resolution (the latest authoritative status from InfinitePay wins), and never downgrade a completed payment to pending without explicit operator action.
- **Operator switches active gateway between deployments**: Payments created under a previous gateway must remain readable and not be re-attempted against InfinitePay.
- **Currency / region mismatch**: All payments through InfinitePay are in BRL for Brazil. Any flow that assumes another currency or region must be blocked from selecting InfinitePay or surface a clear configuration error.
- **Invalid merchant identifier**: If the configured InfinitePay merchant identifier is rejected by InfinitePay when creating a checkout link, the operator must see a diagnostic error in logs and the customer must see a generic, non-leaky error message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST allow the operator to select InfinitePay as the active payment gateway at deployment time, alongside the existing gateway options, without code changes.
- **FR-002**: The platform MUST refuse to start in a production-style environment when InfinitePay is selected as the active gateway and any required InfinitePay credential is missing or empty.
- **FR-003**: The platform MUST fall back to a clearly labeled mock (non-charging) gateway in development environments when InfinitePay is selected but credentials are not configured, and MUST surface this fallback in startup logs.
- **FR-004**: When InfinitePay is the active gateway, the platform MUST generate an InfinitePay checkout link for every pool entry payment request, with the correct amount in BRL centavos and a stable internal reference that allows incoming notifications to be matched back to the originating payment.
- **FR-005**: When the operator's InfinitePay merchant account is configured to accept PIX, credit card, and boleto, the InfinitePay checkout MUST present all three to the customer. The platform itself does not select payment methods on a per-checkout basis — the operator configures method availability once in the InfinitePay dashboard, and the InfinitePay-hosted checkout enforces it.
- **FR-006**: The platform MUST pre-fill customer name and email on the InfinitePay checkout when those values are present on the user record. If a phone number is also present on the user record, the platform MUST pre-fill it as well; if the user record does not carry a phone number, the field MUST be omitted from the request without raising an error.
- **FR-007**: After payment completion, InfinitePay MUST redirect the customer back to the platform's existing payment confirmation page.
- **FR-008**: The platform MUST expose a webhook endpoint that accepts InfinitePay payment notifications and MUST treat the notification body as untrusted. Before applying any state change, the platform MUST resolve the referenced payment by querying InfinitePay's authoritative payment-status endpoint and act only on the status returned by that call. A notification whose referenced payment cannot be retrieved or does not match a known pending payment MUST be discarded without state change.
- **FR-009**: The platform MUST treat repeated InfinitePay notifications for the same payment as idempotent — the state transition for a given payment must occur at most once, and side effects (membership activation, audit logs) must not be duplicated.
- **FR-010**: The platform MUST update each affected payment's status (completed, failed/rejected, expired) based on the authoritative status reported by InfinitePay.
- **FR-011**: When InfinitePay confirms a pool entry payment, the platform MUST activate the corresponding pool membership exactly once and apply the same downstream domain effects already applied for other gateways (audit log entry, pool activation if applicable, notifications).
- **FR-012**: When InfinitePay reports a payment as failed, rejected, or expired, the platform MUST NOT activate pool membership and MUST leave the customer in a state from which they can retry payment.
- **FR-013**: When the InfinitePay API is unavailable or rejects the create-checkout-link request, the platform MUST present the customer with an actionable error message and MUST NOT leave behind an unrecoverable payment record that blocks retry.
- **FR-014**: The platform MUST log all InfinitePay-related events (create-link attempts, webhook receipts, payment-status lookup attempts and results, status transitions, and any rejected notifications) at a level sufficient for operational debugging, without logging sensitive cardholder data.
- **FR-015**: The platform MUST NOT expose InfinitePay credentials, merchant identifier, or webhook secret to any client-facing surface (browser bundles, public APIs, error messages shown to customers).
- **FR-016**: The platform MUST continue to operate the existing payment-related user surfaces (pool join, pool create, payment success page) without gateway-specific copy — the customer experience MUST be functionally equivalent regardless of which gateway is active.
- **FR-017**: The platform MUST preserve historical payments created under any previously active gateway as readable records and MUST NOT attempt to reconcile or replay them against InfinitePay.

### Key Entities *(include if feature involves data)*

- **Payment** (existing): Represents one customer payment intent. The InfinitePay integration introduces no new attributes that the customer perceives — the existing fields (internal id, external gateway id, status, type, amount, platform fee, related user, related pool) are sufficient. Internally, the externally-issued identifier on this record is now the InfinitePay invoice/order identifier when InfinitePay is the active gateway.
- **Gateway Configuration** (operational, not a stored row): The set of operator-supplied values that identify the platform to InfinitePay (merchant identifier at minimum). Lives in deployment configuration, not in the application database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator with valid InfinitePay credentials can switch the active gateway to InfinitePay and have the platform serve the first end-to-end successful pool entry payment within one deployment cycle (no code changes between switching and the first paid entry).
- **SC-002**: For successful payments, the customer's pool membership becomes active within 60 seconds of InfinitePay confirming the payment, in 95% of cases.
- **SC-003**: Zero duplicate pool memberships are produced from duplicate or replayed InfinitePay notifications across a representative sample of at least 100 paid entries.
- **SC-004**: 100% of inbound notifications whose referenced payment cannot be confirmed against InfinitePay's authoritative payment-status endpoint are rejected and produce no state change to any payment record (including notifications referencing unknown, foreign, or fabricated payment identifiers).
- **SC-005**: Customers complete checkout on InfinitePay (from the moment they leave the platform until they land back on the confirmation page) in a time comparable to the previously active gateway — within ±20% of the median checkout duration on the prior gateway.
- **SC-006**: When InfinitePay is unreachable during checkout creation, fewer than 1% of affected customer attempts result in a stuck payment record that blocks the customer from retrying.
- **SC-007**: Production deployments with InfinitePay selected and any required credential missing fail to start in 100% of cases (no silent partial-config startups).

## Assumptions

The following defaults were chosen because they align with the existing payment-gateway architecture and with InfinitePay's documented capabilities. Each can be revisited during clarification if the operator wants different behavior.

- **One active gateway per deployment**: InfinitePay is added as an additional choice for the operator at deployment time, following the same single-active-gateway pattern already used for other gateways. Customers do not pick a gateway at checkout — InfinitePay's checkout page itself lets them pick PIX vs credit vs boleto.
- **Single operator-owned merchant account**: Every entry payment is collected into one operator-controlled InfinitePay account. The recorded platform fee is an internal accounting figure used for downstream prize/payout calculation; it is not split at payment time and is not transferred to a separate account by the gateway.
- **Existing gateways are retained**: Adding InfinitePay does not remove any previously available gateway. Operators can switch back at any time by changing configuration.
- **BRL / Brazil only**: InfinitePay only operates in Brazilian Real for Brazilian customers. The platform's existing pool entry pricing is already in BRL centavos, so this is a natural fit.
- **Webhook-triggered, API-confirmed status reconciliation**: Payment status updates are triggered by InfinitePay webhook deliveries, but the authoritative status is always re-fetched from InfinitePay's payment-status endpoint before any local state change. This matches the pattern used for the current gateway and removes the need to trust the webhook body or rely on an unsigned payload. No background polling loop is introduced as the primary mechanism.
- **No refund flow**: The current payment port does not expose refunds (a deliberate decision in an earlier feature). The InfinitePay integration honors this — refunds, if needed, are handled out-of-band by the operator through InfinitePay's own tools.
- **No customer-facing gateway branding**: The existing payment confirmation page and pool join/create flows remain gateway-neutral in their copy.
- **Customer contact pre-fill is best-effort**: When the platform has the customer's name and email, it pre-fills them; phone is pre-filled when available. Missing fields do not block checkout — the customer can fill them in on InfinitePay's page.
- **Installments are decided on the InfinitePay checkout page**: The platform does not expose an installment selector before redirect; the customer chooses installments (up to InfinitePay's maximum, currently 12) on the InfinitePay-hosted page itself.

## Dependencies

- An active InfinitePay merchant account with a valid merchant identifier (InfiniteTag) controlled by the operator.
- Network egress from the platform to InfinitePay's API endpoints (checkout-link creation and payment-status verification).
- A publicly reachable HTTPS endpoint on the platform for InfinitePay to deliver notification triggers to.

## Out of Scope

- Letting end customers choose between multiple gateways at checkout time.
- Refund or chargeback handling inside the platform.
- **Payouts to pool winners through InfinitePay** — winner payouts continue to use the existing manual / direct-PIX flow and are not added to the payment gateway port.
- Payment methods or currencies that InfinitePay does not support.
- Migrating historical payment records from previous gateways into InfinitePay's record system.
- Surfacing gateway-specific branding in customer-facing copy.
