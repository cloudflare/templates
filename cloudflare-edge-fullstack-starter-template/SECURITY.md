# Security policy

This is a starter template — code you copy and own. Once deployed, it runs
entirely on your own Cloudflare account; there is no Flarelink service in the
request path.

## Reporting a vulnerability

If you find a security issue in this template's code, please email
**hello@flarelink.dev** with `[SECURITY]` in the subject. Don't open a public
issue for vulnerabilities.

## Notes for your own deployment

- **`BETTER_AUTH_SECRET`** signs session tokens. Use a long random value
  (`openssl rand -base64 32`) and never commit it. Rotating it invalidates all
  existing sessions.
- **Email verification is off** by default (the template ships with no email
  provider). For production, wire an email sender and set
  `requireEmailVerification: true` in `server/auth.ts`.
- **Password hashing** is PBKDF2-SHA256 at 100k iterations — chosen to stay
  within the Workers free-tier CPU budget. On the Workers paid plan you can
  raise it toward OWASP's 600k baseline in `server/auth.ts`.
- Every data route is scoped to the signed-in user (`WHERE user_id = ...`), and
  file downloads are restricted to the caller's own key prefix.
