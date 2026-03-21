# Feature Specification: Critical Fixes + Telegram Prediction Reminders

**Feature Branch**: `004-critical-fixes-telegram-reminders`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "Critical Fixes (OTP rate limit, auth guard, dead code cleanup) + Telegram Prediction Reminders (1 hour before match)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - OTP Brute-Force Protection (Priority: P1)

A malicious actor attempts to brute-force OTP codes by sending multiple verification requests for a phone number. The system must limit OTP requests to 3 per 5 minutes per phone number, returning a rate limit error after the threshold is exceeded.

**Why this priority**: Security vulnerability — without per-phone rate limiting, attackers can spam OTP requests using only the global 100/min IP-based limit, making brute-force feasible.

**Independent Test**: Can be fully tested by sending 4+ OTP requests for the same phone number within 5 minutes and verifying the 4th is rejected with a rate limit error.

**Acceptance Scenarios**:

1. **Given** a user has sent 3 OTP requests for the same phone number within 5 minutes, **When** they send a 4th request, **Then** the system returns a rate limit error message asking them to try again later.
2. **Given** a user was rate-limited 5 minutes ago, **When** they send a new OTP request, **Then** the system processes it normally and delivers the OTP.
3. **Given** two different phone numbers, **When** each sends 3 OTP requests within 5 minutes, **Then** both are allowed (rate limit is per-phone, not global).

---

### User Story 2 - Prediction Reminder via Telegram (Priority: P1)

A pool member who has not submitted a prediction for an upcoming match receives a Telegram reminder approximately 1 hour before kickoff. The reminder includes the match teams and encourages the user to submit their prediction.

**Why this priority**: Core engagement feature — users who forget to submit predictions have a poor experience and miss the main value of the app. Reminders directly improve participation rates.

**Independent Test**: Can be tested by having a pool member without a prediction for a match starting within 1 hour, triggering the reminder job, and verifying the Telegram message is received.

**Acceptance Scenarios**:

1. **Given** a pool member has NOT submitted a prediction for a match starting in 45 minutes, **When** the reminder job runs, **Then** the user receives a Telegram message with the match teams and a prompt to submit their prediction.
2. **Given** a pool member HAS already submitted a prediction for an upcoming match, **When** the reminder job runs, **Then** no reminder is sent for that match.
3. **Given** a user is a member of multiple pools and has no prediction for an upcoming match in any of them, **When** the reminder job runs, **Then** the user receives only ONE reminder per match (not one per pool).
4. **Given** a reminder was already sent to a user for a specific match, **When** the reminder job runs again, **Then** no duplicate reminder is sent.
5. **Given** a user's phone number is not linked to a Telegram chat, **When** the reminder job runs, **Then** the system skips that user without error.

---

### User Story 3 - Authenticated Route Protection (Priority: P2)

When a non-authenticated user tries to access protected pages (pool creation, pool details, predictions, ranking, pool management, settings), they are automatically redirected to the login page before seeing any content.

**Why this priority**: UX improvement — current imperative guards inside components cause a flash of content before redirect. Router-level guards prevent this entirely and centralize auth logic.

**Independent Test**: Can be tested by navigating to any protected route while logged out and verifying immediate redirect to login with no content flash.

**Acceptance Scenarios**:

1. **Given** a user is not logged in, **When** they navigate to any pool-related page, **Then** they are redirected to the login page before any page content renders.
2. **Given** a user is not logged in, **When** they navigate to the settings page, **Then** they are redirected to the login page.
3. **Given** a user is not logged in, **When** they open an invite link, **Then** they are redirected to login and the invite URL is preserved so they return to it after authentication.
4. **Given** a logged-in user whose profile name is not set, **When** they navigate to a protected page, **Then** they are redirected to the profile completion page first.
5. **Given** a logged-in user with a complete profile, **When** they navigate to a protected page, **Then** the page renders normally.

---

### User Story 4 - Dead Code Cleanup (Priority: P3)

The codebase contains unused files and no-op middleware that add confusion for developers. Removing them reduces maintenance burden and prevents future developers from wasting time on dead code paths.

**Why this priority**: Developer experience — does not affect end users directly but improves codebase quality and reduces confusion.

**Independent Test**: Can be verified by confirming the application builds, all tests pass, and no functionality is broken after removing the identified dead code.

**Acceptance Scenarios**:

1. **Given** unused source files are removed, **When** the application is built, **Then** the build succeeds with no errors.
2. **Given** unused source files are removed, **When** all tests are run, **Then** all tests pass.
3. **Given** the no-op pool owner middleware is removed, **When** pool owner operations are performed, **Then** they continue to work as before (ownership is enforced in the service layer).

---

### User Story 5 - Environment Configuration Completeness (Priority: P3)

A new developer setting up the project for the first time has all required environment variables documented in the example configuration file, so they don't encounter mysterious runtime errors.

**Why this priority**: Developer onboarding — missing documentation for a required env var causes confusion during setup.

**Independent Test**: Can be verified by comparing all environment variables read at runtime against those listed in the example configuration file.

**Acceptance Scenarios**:

1. **Given** a developer copies the example env file, **When** they fill in all listed values, **Then** the application starts without missing environment variable errors.

---

### Edge Cases

- What happens when the reminder job encounters a Telegram API failure for one user? The job logs the error and continues processing remaining users.
- What happens when a match time is updated after a reminder was already sent? The dedup prevents re-sending, which is acceptable (one reminder per match is sufficient).
- What happens if the server restarts during the 1-hour reminder window? Users may receive a duplicate reminder — acceptable tradeoff given the low impact of a second reminder.
- What happens when a rate-limited OTP request uses a different IP but the same phone number? The rate limit applies per phone number, so the request is still blocked.
- What happens when a match has no defined teams yet (TBD in knockout stage)? The reminder job only processes matches with defined teams.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST limit OTP send requests to 3 per 5-minute window per phone number.
- **FR-002**: System MUST return a user-friendly rate limit error message when the OTP limit is exceeded.
- **FR-003**: System MUST check for pool members without predictions for matches starting within the next 60 minutes.
- **FR-004**: System MUST send a Telegram reminder to each identified user containing the match teams.
- **FR-005**: System MUST send at most one reminder per user per match, regardless of how many pools the user belongs to.
- **FR-006**: System MUST skip users whose phone numbers are not linked to a Telegram chat, without generating errors.
- **FR-007**: System MUST redirect unauthenticated users to the login page before rendering any protected page content.
- **FR-008**: System MUST preserve the invite URL when redirecting unauthenticated users from invite pages to login.
- **FR-009**: System MUST redirect users without a completed profile to the profile completion page.
- **FR-010**: System MUST remove identified dead code files without affecting existing functionality.
- **FR-011**: System MUST document all required environment variables in the example configuration file.
- **FR-012**: System MUST run the prediction reminder check periodically (every 15 minutes).

### Key Entities

- **Prediction Reminder**: A notification sent to a pool member who has not submitted a prediction for an upcoming match. Tracked by user and match combination to prevent duplicates.
- **Rate Limit Window**: A time-based counter per phone number that tracks OTP request frequency. Resets after the 5-minute window expires.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of OTP requests beyond the 3-per-5-minute threshold are rejected with a clear error message.
- **SC-002**: Pool members without predictions receive a reminder between 45-60 minutes before match kickoff.
- **SC-003**: Zero duplicate reminders are sent to the same user for the same match during normal operation.
- **SC-004**: Protected pages redirect to login with no visible content flash for unauthenticated users.
- **SC-005**: Application builds and all existing tests pass after dead code removal.
- **SC-006**: All environment variables used at runtime are documented in the example configuration file.

## Assumptions

- The existing OTP rate limit definition (3 req/5min per phone) is correct and only needs to be activated on the appropriate route.
- In-memory dedup for reminders is acceptable given the single-process deployment model and the low impact of occasional duplicate reminders on server restart.
- The 15-minute job interval is sufficient — users receive reminders between 45-60 minutes before kickoff depending on timing.
- The reminder message is sent in Portuguese (pt-BR) matching the rest of the application.
- Removing the identified dead code files has no side effects since they are confirmed to have zero imports across the codebase.
