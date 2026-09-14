# Desktop Licensing

## Purpose

Tech Media Secure issues 16-digit activation keys for desktop applications. Each key supports one active machine.

The activation key is not the permanent digital license. A successful activation returns a separate opaque license token.

## Administrator Flow

1. Open `/admin/licenses`.
2. Register the desktop application with a stable application ID.
3. Select **Generate key** for that application.
4. Copy the displayed 16-digit key.
5. Give the key to the customer.

The full key appears once. The database stores an HMAC hash and the last four digits only.

An administrator can revoke a license or reset its machine binding. Reset invalidates the existing license token.

## Desktop Installation ID

Create one random UUID during the first application start. Store it in the operating system protected application storage.

Use the same installation ID for every activation and validation request. Do not use a user name, disk serial, or MAC address.

Example installation ID:

```text
5cfe7a1d-467d-4da8-9a06-20b7cc783ff4
```

## Activate a License

Send this request after the user enters the 16-digit key:

```http
POST https://secure.techmedia.in/api/v1/licenses/activate
Content-Type: application/json
```

```json
{
  "appId": "techmedia-desktop",
  "licenseKey": "1234-5678-9012-3456",
  "machineId": "5cfe7a1d-467d-4da8-9a06-20b7cc783ff4",
  "machineLabel": "Sundar Office PC"
}
```

A first activation returns:

```json
{
  "status": "ACTIVE",
  "licenseToken": "tml_<opaque-token>",
  "licenseId": "<license-id>",
  "appId": "techmedia-desktop",
  "activatedAt": "2026-09-14T00:00:00.000Z",
  "machineLimit": 1
}
```

Store `licenseToken` in the operating system credential vault. Do not store it in a plain configuration file.

The same key and installation ID can activate again. The server rotates the license token and returns `ACTIVE`.

A different installation ID receives HTTP `409`:

```json
{
  "error": "DUPLICATE_MACHINE",
  "message": "This license key is already active on another machine."
}
```

## Validate a License

Validate the stored token during application start and at a suitable interval while the application runs:

```http
POST https://secure.techmedia.in/api/v1/licenses/validate
Content-Type: application/json
```

```json
{
  "appId": "techmedia-desktop",
  "licenseToken": "tml_<opaque-token>",
  "machineId": "5cfe7a1d-467d-4da8-9a06-20b7cc783ff4"
}
```

A valid license returns HTTP `200` and `valid: true`. Invalid, revoked, or wrong-machine licenses return HTTP `401`.

## Response Codes

| HTTP | Error | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | A key or installation ID has an invalid format. |
| 401 | `INVALID_LICENSE` | The token is invalid for this application or machine. |
| 401 | `LICENSE_REVOKED` | An administrator revoked the activation key. |
| 404 | `INVALID_LICENSE` | The activation key does not exist for the application. |
| 409 | `DUPLICATE_MACHINE` | Another machine already uses the activation key. |
| 409 | `LICENSE_STATE_CHANGED` | A concurrent license update occurred; retry activation. |
| 429 | `RATE_LIMITED` | The client made too many rejected attempts. |

## Security Rules

- Use HTTPS only.
- Keep the application ID stable across releases.
- Keep the installation ID and license token in protected local storage.
- Never log a full activation key or license token.
- Treat the server validation response as the license authority.
- Require an administrator reset before moving a license to another machine.

The one-machine rule depends on keeping the random installation ID in protected operating-system storage. It prevents ordinary key reuse, but it is not hardware attestation. A future high-assurance client can add a device-generated key pair and sign validation challenges without changing the 16-digit activation experience.
