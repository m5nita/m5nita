# Feature Specification: Cloudflare Turnstile on Login Screen

**Feature Branch**: `013-cloudflare-turnstile`
**Created**: 2026-04-14
**Status**: Draft
**Input**: User description: "Add Cloudflare Turnstile CAPTCHA verification to the login/initial screen of the web app. Users must complete the Turnstile challenge before they can submit the login form (email/password or social). The API must verify the Turnstile token server-side with Cloudflare before processing authentication."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block automated login attempts on the initial screen (Priority: P1)

A visitor arrives at the application's initial/login screen. Before they can submit credentials (email/password or social provider), they must pass a human-verification challenge. Real users pass invisibly or with one tap; bots and scripted clients are blocked.

**Why this priority**: Protects the authentication entry point from credential-stuffing and automated abuse. Delivers value by itself as soon as shipped.

**Independent Test**: Load the login screen, confirm the submit button remains disabled until the challenge completes, submit valid credentials, and verify sign-in succeeds only when a valid human-verification token accompanies the request.

**Acceptance Scenarios**:

1. **Given** a visitor on the login screen, **When** the page loads, **Then** a human-verification challenge is presented and the submit button is disabled until it succeeds.
2. **Given** the challenge has succeeded, **When** the user submits valid credentials, **Then** authentication proceeds normally.
3. **Given** the challenge has not been completed or its token is missing, **When** the user attempts to submit, **Then** the request is rejected and the user is prompted to complete the challenge.
4. **Given** a submission with an invalid or reused verification token, **When** the server validates it, **Then** authentication is refused with a clear error message.

---

### User Story 2 - Graceful failure when the verification service is unavailable (Priority: P2)

If the human-verification service cannot be reached or returns an error, the user must receive a clear, non-technical explanation and a way to retry, rather than a silent failure or an unusable screen.

**Why this priority**: Availability of the sign-in path is business-critical. Verification outages must not lock legitimate users out without recourse.

**Independent Test**: Simulate a network or service failure for the verification provider and confirm the UI displays a retry-friendly error and that the server consistently refuses unverified submissions.

**Acceptance Scenarios**:

1. **Given** the verification widget fails to load, **When** the user opens the login screen, **Then** an error state is shown with a retry action.
2. **Given** the server cannot reach the verification service, **When** a login is submitted, **Then** the request is refused and the user is asked to try again shortly.

---

### Edge Cases

- Expired verification token (user idles on the page past the token's validity window) — the widget must re-challenge before submission is allowed.
- Double-submission of the same verification token — the server must reject the second attempt.
- Users with assistive technologies — challenge must remain accessible (keyboard navigable, screen-reader compatible).
- Users behind privacy-focused browsers or ad blockers — failure must be detected and surfaced with a retry, not a silent stall.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The login screen MUST present a human-verification challenge before allowing credential submission.
- **FR-002**: The login submit action MUST be disabled until the challenge yields a valid verification token.
- **FR-003**: Every authentication request (email/password and social providers) MUST include the verification token.
- **FR-004**: The server MUST validate the verification token with the verification provider on every login request before processing credentials.
- **FR-005**: The server MUST reject authentication requests whose token is missing, invalid, expired, or already used.
- **FR-006**: The user MUST see a clear error message when verification fails, with the ability to retry without reloading the page.
- **FR-007**: Verification secrets MUST NOT be exposed to the browser; only the public site key may be shipped to the client.
- **FR-008**: The feature MUST degrade gracefully when the verification provider is unreachable: the server continues to refuse unverified logins and the client shows a retry-friendly error.
- **FR-009**: The challenge MUST be accessible via keyboard and screen readers on the login screen.

### Key Entities

- **Verification Challenge**: A one-time proof that the submitter is human, issued to the browser and attached to the login request.
- **Verification Token**: Short-lived opaque string representing a successful challenge; exchanged server-to-server with the provider to confirm authenticity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of login requests reaching the authentication endpoint carry a verification token that the server independently validates before credentials are checked.
- **SC-002**: Automated login attempts without a valid token are rejected at the authentication endpoint in 100% of cases.
- **SC-003**: For legitimate users, added friction at sign-in is under 2 seconds at the median and under 5 seconds at the 95th percentile.
- **SC-004**: Login success rate for legitimate users does not drop by more than 1 percentage point after rollout, measured over the first two weeks.
- **SC-005**: Zero incidents of verification secrets being exposed in client bundles or network responses.

## Assumptions

- The verification provider used is Cloudflare Turnstile, chosen by the user.
- The login screen is the only surface in scope for this feature; other forms (signup, password reset) are out of scope for this iteration.
- Site key and secret are configured via environment variables per environment (development, staging, production).
- Test/sandbox key pair is used in non-production environments so automated tests can run without hitting the real provider.
