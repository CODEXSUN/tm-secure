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
- Applied D1 migrations `0001_identity_foundation.sql` and `0002_admin_console.sql` to the production database.
- Deployed Worker version `22384b0a-9dbc-4497-ac17-0d2fde43dfd8` to `secure.techmedia.in`.
- Added the production `OTP_HMAC_KEY` secret. Email OTP remains unavailable until the Cloudflare sending domain is onboarded.
- Replaced the Resend API integration with the native Cloudflare Email Service binding. The sender is restricted to `otp@auth.techmedia.in`.
