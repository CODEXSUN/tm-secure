# Changelog

## Version State

Current version: 1.0.4

Release tag: v-1.0.4

Changelog label: v 1.0.4

## v-1.0.4

### [v 1.0.4] 2026-09-01 - Direct SPA route support

#### App Codebase Changes

- Added the Worker asset fallback for direct `/admin` and `/verify` navigation.
- Preserved the account identifier when the user opens the verification page from sign-in.

## v-1.0.3

### [v 1.0.3] 2026-09-01 - Manual administrator OTP verification

#### Database Changes

- Added migration `0003_manual_admin_otp.sql` for administrator-issued verification codes.

#### App Codebase Changes

- Removed the Hostinger SMTP client, configuration, and Cloudflare Email setup.
- Added the `/admin/verification-codes` page. It accepts a pending identity and shows one 10-minute code for the administrator to share.
- Added the separate `/verify` page. Users verify with their mobile number, email, or username and the administrator-issued code.
- Added audit events for manual code issuance and verification.

## v-1.0.2

### [v 1.0.2] 2026-08-31 - Hostinger SMTP delivery

#### App Codebase Changes

- Replaced the unavailable Cloudflare Email Service sender with direct Hostinger SMTPS delivery through Cloudflare TCP sockets on port 465.
- Added the non-secret Hostinger SMTP connection configuration to the Worker and retained the mailbox password only as the `HOSTINGER_SMTP_PASSWORD` Cloudflare secret.

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
