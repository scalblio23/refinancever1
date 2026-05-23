# quickchoice-api

Telnyx SMS verification backend for Quick Choice Finance Solutions.

## Environment variables (set in Railway → Variables tab)

| Variable | Required | Description |
|----------|----------|-------------|
| `TELNYX_API_KEY` | Yes | Your Telnyx API key (starts with `KEY...`) |
| `TELNYX_VERIFY_PROFILE_ID` | Yes | The UUID of your Telnyx Verify Profile |
| `ALLOWED_ORIGIN` | Recommended | The exact domain allowed to call this API, e.g. `https://quickchoice.finchecker.com.au`. Defaults to `*` (any origin) — restrict for production. |
| `PORT` | Auto | Railway injects this. Don't set manually. |

## Endpoints

- `GET /` — health check
- `POST /api/send-code` — body: `{ "mobile": "0412345678" }`
- `POST /api/check-code` — body: `{ "mobile": "0412345678", "code": "123456" }`
- `POST /api/submit-lead` — body: full lead payload, logs to console for now

## Rate limit

5 requests per IP per minute on each endpoint. Resets on server restart.
