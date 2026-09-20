# Authentication provider setup

Sammlerraum exposes Better Auth at `${APP_ORIGIN}/api/auth`. Set every variable below in the web runtime environment; the web process fails closed when any auth or SMTP variable is absent or invalid.

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Random signing/encryption secret of at least 32 characters. Generate a production value with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret. |
| `APPLE_CLIENT_ID` | Apple Services ID used for web sign-in. |
| `APPLE_CLIENT_SECRET` | Apple client-secret JWT generated from the Sign in with Apple key. Rotate it before its configured expiry. |
| `SMTP_HOST` | SMTP server hostname. |
| `SMTP_PORT` | SMTP server port, commonly `587` for STARTTLS or `465` for implicit TLS. |
| `SMTP_SECURE` | `true` for implicit TLS, otherwise `false` to require STARTTLS. |
| `SMTP_USER` | SMTP authentication username. |
| `SMTP_PASSWORD` | SMTP authentication password. |
| `SMTP_FROM` | Sender mailbox, optionally with a display name. |

Use these exact provider callbacks after replacing the origin with the deployed `APP_ORIGIN`:

- Google authorized redirect URI: `${APP_ORIGIN}/api/auth/callback/google`
- Apple Services ID return URL: `${APP_ORIGIN}/api/auth/callback/apple`

The provider consoles must also list the deployed origin as an authorized web origin/domain. `APP_ORIGIN` must be one HTTPS origin in production, without a path, query, fragment, or embedded credentials. Local development may use an HTTP localhost origin.

Email verification is sent at registration and before an unverified password user can sign in. Password reset uses the same SMTP transport. Verify both messages through a real mailbox and confirm that the generated links return to the deployed origin before enabling production traffic.

SMTP always requires transport encryption. `SMTP_SECURE=true` uses implicit TLS; `SMTP_SECURE=false` requires a successful STARTTLS upgrade and fails if the server or network does not offer it. Certificate validation remains enabled in both modes.

Live Google sign-in remains blocked until a real Google OAuth client and consent screen are configured. Live Apple sign-in remains blocked until a Services ID, verified domain, return URL, signing key, and current client-secret JWT are configured. Live verification and password reset remain blocked until working SMTP credentials and a permitted sender are configured. Repository test/build values are marked test-only or build-only and are not runtime credentials.

Same-email social sign-in never links an existing account implicitly. A signed-in user must start an explicit provider-linking flow. Direct account unlinking and passkey deletion are disabled until the account-security service can enforce the verified-recovery-factor rule.
