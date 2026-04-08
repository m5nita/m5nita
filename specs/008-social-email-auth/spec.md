# Feature Specification: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "preciso além de aceitar login pelo Telegram também aceitar via providers (Social Sign-On) com Google/Apple e via magic link por email"

## Clarifications

### Session 2026-04-08

- Q: Como funciona o account linking entre Telegram e outros providers? → A: Telegram (telefone) e providers baseados em email (Google, Apple, Magic Link) são espaços de identidade separados. Auto-link só funciona entre providers que compartilham email verificado (Google ↔ Apple ↔ Magic Link). Telegram + provider de email = contas distintas, a menos que o provider forneça telefone que dê match com o número do Telegram.
- Q: Como deve ser a hierarquia visual dos métodos de login? → A: Social primeiro — botões Google e Apple no topo (mais rápidos, 1 clique), separador "ou", depois email magic link, e por último Telegram/telefone como opção secundária.
- Q: Qual serviço de envio de email para magic links? → A: Resend — API moderna, free tier generoso, ótima DX com SDK TypeScript.
- Q: O que fazer com os emails fake ({numero}@m5nita.app) dos usuários existentes em produção? → A: Não é necessária migration. Novos usuários Telegram usarão domínio sentinel `@phone.noemail.internal`. Os antigos `@m5nita.app` são igualmente inertes (emailVerified=false + phone-number fora de trustedProviders).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Google Sign-On (Priority: P1)

A user who prefers not to use Telegram can sign in using their Google account. On the login page, the user taps "Continue with Google", is redirected to Google's consent screen, authorizes the app, and is redirected back with an active session. If the user is new, an account is automatically created. If the user already exists (matched by email), the Google provider is linked to the existing account.

**Why this priority**: Google is the most widely used OAuth provider and removes the Telegram dependency, significantly expanding the potential user base.

**Independent Test**: Can be fully tested by tapping "Continue with Google" on the login page, completing Google authorization, and verifying the user lands on the home page (or complete-profile page if new).

**Acceptance Scenarios**:

1. **Given** a new user on the login page, **When** they tap "Continue with Google" and authorize the app, **Then** an account is created with their Google name/email/avatar and they are redirected to the complete-profile page.
2. **Given** an existing user who previously signed in via Telegram (with matching email), **When** they tap "Continue with Google" using the same email, **Then** the Google provider is linked to their existing account and they are redirected to the home page.
3. **Given** a user on the Google consent screen, **When** they cancel the authorization, **Then** they are returned to the login page with an informational message.
4. **Given** an existing user who previously signed in via Google, **When** they tap "Continue with Google" again, **Then** they are signed in and redirected to the home page.

---

### User Story 2 - Apple Sign-On (Priority: P1)

A user on an Apple device can sign in using their Apple ID. On the login page, the user taps "Continue with Apple", completes Apple's sign-in flow, and is redirected back with an active session. Apple may provide a private relay email; the system handles this gracefully.

**Why this priority**: Apple Sign-In is essential for iOS users and is required by Apple's App Store guidelines when other social sign-in options are offered.

**Independent Test**: Can be fully tested by tapping "Continue with Apple" on the login page, completing Apple sign-in, and verifying the user lands on the home page or complete-profile page.

**Acceptance Scenarios**:

1. **Given** a new user on the login page, **When** they tap "Continue with Apple" and authorize the app, **Then** an account is created with their Apple name/email and they are redirected to the complete-profile page.
2. **Given** a user who chose to hide their email (Apple Private Relay), **When** the sign-in completes, **Then** the system stores the relay email and the account functions normally.
3. **Given** an existing user with a matching email, **When** they sign in via Apple, **Then** the Apple provider is linked to their existing account.
4. **Given** a user who cancels Apple Sign-In, **When** they are returned to the login page, **Then** an informational message is shown.

---

### User Story 3 - Email Magic Link (Priority: P2)

A user who doesn't have Telegram, Google, or Apple can sign in using their email address. On the login page, the user enters their email, receives a magic link via email, clicks the link, and is signed in with an active session.

**Why this priority**: Email is the universal fallback — every user has an email address. It ensures no one is locked out regardless of which services they use.

**Independent Test**: Can be fully tested by entering an email on the login page, clicking the magic link in the received email, and verifying the user lands on the home page or complete-profile page.

**Acceptance Scenarios**:

1. **Given** a new user on the login page, **When** they enter their email and click "Send magic link", **Then** they receive an email with a sign-in link within 60 seconds.
2. **Given** a user who received a magic link email, **When** they click the link, **Then** they are signed in and redirected to the app (home page or complete-profile page if new).
3. **Given** a user who enters an email already associated with an existing account, **When** they click the magic link, **Then** they are signed into their existing account.
4. **Given** a user who clicks a magic link after it has expired, **When** the link is processed, **Then** they see a message that the link has expired and are prompted to request a new one.
5. **Given** a user who requests multiple magic links, **When** they click any of the links, **Then** only the most recent link works; older links are invalidated.

---

### User Story 4 - Unified Login Page (Priority: P1)

The login page presents all available authentication methods in a clear, organized layout. Users can choose between Telegram (existing), Google, Apple, or email magic link to sign in or create an account.

**Why this priority**: The login page is the single entry point for all users. A well-organized page that shows all options is critical for discoverability and adoption.

**Independent Test**: Can be tested by visiting the login page and verifying all four sign-in options are visible and clearly labeled.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they visit the login page, **Then** they see Google and Apple buttons at the top, followed by a separator, then email magic link input, and finally Telegram (phone number) as a secondary option.
2. **Given** a user on a mobile device, **When** they view the login page, **Then** all sign-in options are accessible and properly laid out with social providers most prominent.
3. **Given** an authenticated user, **When** they navigate to the login page, **Then** they are redirected to the home page.

---

### User Story 5 - Account Linking (Priority: P2)

A user who has signed in with one email-based method (Google, Apple, or Magic Link) can also sign in with a different email-based method using the same email. The system automatically links accounts that share the same verified email address across these providers. Telegram (phone-based) accounts are a separate identity space and are not auto-linked to email-based accounts.

**Why this priority**: Prevents duplicate accounts among email-based providers and ensures users don't lose access to their data when switching between Google, Apple, and email magic link.

**Independent Test**: Can be tested by creating an account via Google, then signing in via Magic Link using the same email, and verifying both methods access the same account.

**Acceptance Scenarios**:

1. **Given** a user who signed up via Google with email `user@example.com`, **When** they later sign in via email magic link using `user@example.com`, **Then** they access the same account and data.
2. **Given** a user who signed up via Magic Link, **When** they sign in via Apple using the same email, **Then** the Apple provider is linked to their existing account.
3. **Given** a user with multiple linked email-based providers, **When** they sign in via any of their linked methods, **Then** they always access the same unified account.
4. **Given** a user who signed up via Telegram (phone), **When** they sign in via Google with a different email, **Then** a separate account is created — the two are not linked.

---

### Edge Cases

- What happens when a user tries to link a Google/Apple account whose email is already associated with a different user? → The system denies the link and shows an error message explaining the email is already in use by another account.
- What happens when a user has a Telegram account and also signs in via Google/Apple/Magic Link? → Two separate accounts are created. Telegram (phone-based) and email-based providers are separate identity spaces. Linking only happens automatically between email-based providers sharing the same verified email.
- What happens when the magic link email is not delivered? → The user can request a new magic link after a short cooldown period (30 seconds).
- What happens when Apple provides a private relay email that later changes? → The system uses Apple's stable user identifier (sub claim) for matching, not just email.
- What happens during Google/Apple OAuth if the provider is temporarily unavailable? → The user sees a friendly error message and is encouraged to try again or use a different sign-in method.
- What happens when a user signs in via social provider but has no display name set? → They are redirected to the complete-profile page, same as existing Telegram flow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support Google OAuth 2.0 as a sign-in provider.
- **FR-002**: System MUST support Apple Sign-In as a sign-in provider.
- **FR-003**: System MUST support email-based magic link authentication.
- **FR-004**: System MUST auto-create accounts for new users signing in via any provider.
- **FR-005**: System MUST automatically link accounts that share the same verified email address across email-based providers (Google, Apple, Magic Link). Telegram (phone-based) accounts exist as a separate identity space and are NOT auto-linked to email-based accounts.
- **FR-006**: System MUST preserve existing Telegram phone-number OTP authentication alongside new methods.
- **FR-007**: System MUST redirect new users (without a display name) to the complete-profile page after sign-in, regardless of the authentication method used.
- **FR-008**: System MUST populate user profile fields (name, email, avatar) from provider data when available.
- **FR-016**: System MUST stop generating real-looking fake emails for Telegram-only users. Telegram accounts should use an inert sentinel email on a non-routable domain (e.g., `@phone.noemail.internal`) that will never match real emails from social/magic-link providers. Combined with `emailVerified: false` and exclusion from `trustedProviders`, this prevents accidental account linking.
- **FR-009**: Magic links MUST expire after a configurable time period (default: 15 minutes).
- **FR-010**: System MUST invalidate previous magic links when a new one is requested for the same email.
- **FR-011**: System MUST handle Apple's private relay emails without breaking account functionality.
- **FR-012**: System MUST show clear error messages when OAuth flow fails or is cancelled.
- **FR-013**: System MUST rate-limit magic link requests to prevent abuse (max 3 requests per email per 5 minutes).
- **FR-014**: Login page MUST display all available sign-in options in a clear, accessible layout.
- **FR-015**: System MUST maintain the same session behavior (90-day expiry, 24-hour refresh) for all authentication methods.

### Key Entities

- **User**: Existing entity; may now have email populated from social providers. Serves as the unified identity across all sign-in methods.
- **Account**: Existing entity; stores provider-specific credentials (Google, Apple, Telegram). A user can have multiple accounts (one per provider).
- **Verification**: Existing entity; used for magic link tokens with expiry tracking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete sign-in via Google or Apple in under 30 seconds (excluding provider consent screen time on first use).
- **SC-002**: Users receive magic link emails within 60 seconds of requesting them.
- **SC-003**: 95% of users who start a social sign-in flow complete it successfully.
- **SC-004**: Users who sign in via different methods linked to the same email always access the same account — zero duplicate accounts from email-matched providers.
- **SC-005**: All existing Telegram-based sign-in flows continue to work without any changes to the user experience.
- **SC-006**: The login page loads and displays all sign-in options within 2 seconds on a standard mobile connection.

## Assumptions

- Google Cloud and Apple Developer accounts are available and configured for OAuth credentials.
- Resend will be used as the email delivery service for sending magic link emails.
- The app's domain has proper DNS and SSL configuration for OAuth redirect URIs.
- Apple Sign-In requires an Apple Developer Program membership (assumed to be active).
- The existing `account` and `verification` database tables are sufficient to store OAuth and magic link data without schema changes.
- Magic link emails will use a standard transactional email template with the app's branding.
