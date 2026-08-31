# Changelog

## Version State

Current version: 1.0.1

Release tag: v-1.0.1

Changelog label: v 1.0.1

## v-1.0.1

### [v 1.0.1] 2026-08-31 11:30 pm - TechMedia Secure identity foundation

#### Database Changes

- Database update: Yes (manual).
- Added D1 schema migrations for global identities, identifiers, business profiles, OTP challenges, browser sessions, audit events, admin accounts, OAuth clients, and registered devices.
- Seeded the initial administrator account for local setup. Change its password before production use.

#### App Codebase Changes

- Added the TechMedia Secure Worker authentication service with email OTP, 10-digit Indian mobile identity, browser sessions, audit events, and administrator approval.
- Added the `/admin` identity dashboard for users, applications, devices, sessions, audit events, and security settings.
- Added a guarded local development bypass. It requires `NODE_ENV=development` and `AUTH_BYPASS_ENABLED=true`.
- Added the Tech Media logo, favicon, Shadcn UI primitives, Tailwind CSS, and a neutral theme with mandatory Tech Media purple branding.
- Added local release tooling for version checks and GitHub commit review.
