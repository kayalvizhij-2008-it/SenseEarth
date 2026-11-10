# Google sign-in — setup and behaviour

SenseEarth signs users in with **Google OAuth 2.0 using the authorization-code flow with PKCE**.
The backend owns the client secret; the browser only receives Google's authorize URL and, after
the callback, a SenseEarth session token.

The integration is complete in code, but it stays **switched off until real credentials exist**.
`GET /api/auth/google/status` reports `enabled: false` and lists the missing variables, and the
login page disables its Google button with that explanation. Nothing simulates a Google user.

## 1. Google Cloud project

1. Open <https://console.cloud.google.com/> and create (or pick) a project, e.g. `senseearth-dev`.
2. Go to **APIs & Services → OAuth consent screen**.
   - User type: **External** while testing.
   - App name, support email, developer contact.
   - Scopes: `openid`, `email`, `profile` (these are non-sensitive; no Google verification review).
   - Test users: add every Google account that should be able to sign in while the app is in
     "Testing" (otherwise Google returns `access_denied`).
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `SenseEarth local`.
   - **Authorised JavaScript origins**
     - `http://127.0.0.1:5173`
     - `http://localhost:5173`
     - (production) `https://your-domain.example`
   - **Authorised redirect URIs** — this is the backend callback, not the frontend:
     - `http://127.0.0.1:8000/api/auth/google/callback`
     - `http://localhost:8000/api/auth/google/callback`
     - (production) `https://api.your-domain.example/api/auth/google/callback`
4. Copy the **Client ID** and **Client secret**.

Notes:
- `127.0.0.1` and `localhost` are different origins. If you open the app on one host and the
  redirect URI is on the other, Google rejects the request. Keep both pairs identical to what you
  actually use, and set `SENSEEARTH_GOOGLE_REDIRECT_URI` to the exact redirect URI you registered.
- Google no longer accepts `http://` origins other than loopback; production needs HTTPS.

## 2. Backend environment

Add to `.env` (or the process environment) and restart uvicorn:

```env
SENSEEARTH_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
SENSEEARTH_GOOGLE_CLIENT_SECRET=...
SENSEEARTH_GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/api/auth/google/callback
SENSEEARTH_FRONTEND_URL=http://127.0.0.1:5173
```

Verify:

```bash
curl http://127.0.0.1:8000/api/auth/google/status
# {"enabled":true,"redirectUri":"http://127.0.0.1:8000/api/auth/google/callback",...}
```

`enabled: false` means one of the two credentials is empty — the button stays disabled rather than
failing silently.

## 3. What happens on "Continue with Google"

| Step | Endpoint | Purpose |
| --- | --- | --- |
| 1 | `GET /api/auth/google/status` | Enables/disables the button and explains what is missing. |
| 2 | `GET /api/auth/google/start` | Creates a single-use `state` and PKCE `code_verifier` in `oauth_states`, returns Google's authorize URL. |
| 3 | Google consent screen | User picks an account. |
| 4 | `GET /api/auth/google/callback` | Verifies `state`, exchanges the code (client secret stays server-side), reads the OpenID userinfo, links or creates the account. |
| 5 | `GET /auth/callback?token=…` (frontend) | Verifies the token with `/api/auth/me`, stores the session, redirects to `/app`. |

Account rules:
- A Google `sub` that already exists signs into that account.
- Otherwise a verified email that already has a password account is **linked** to the Google
  identity (no duplicate account).
- Otherwise a new account is created with `auth_provider = 'google'` and an unusable random
  password hash, so password login can never match it.

Errors are redirected to the frontend callback with `?error=…` (`access_denied`,
`invalid_state`, `token_exchange_failed`, `userinfo_failed`, `email_not_verified`, …) and shown as
plain-language messages.

## 4. Testing status

- Backend contract verified locally: `/status` returns `enabled:false` with the missing variable
  names, and `/start` returns HTTP 503 with an explanatory message while no credentials exist.
- The full redirect → consent → callback → session flow **has not been exercised**, because no
  Google client credentials are available in this workspace. Once you add them, sign in with a
  Google account listed as a test user and confirm you land in `/app` with your name and email in
  the sidebar.

## 5. Security notes

- The client secret lives only in backend environment variables; it is never sent to the browser,
  logged, or committed.
- `state` is single-use, stored server-side, and pruned after ten minutes.
- PKCE (S256) is used even though a client secret is present.
- Session tokens are HMAC-signed with `SENSEEARTH_SECRET_KEY` (or `storage/.session_secret`) and
  expire after `SENSEEARTH_SESSION_TTL` seconds (7 days by default).
