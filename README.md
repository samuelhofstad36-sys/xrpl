# Attestry — coming-soon site

A single landing page plus a tiny Node server (no dependencies) that collects waitlist emails.

## Deploy on Railway

1. Unzip this folder and push it to a new GitHub repo (or run `railway up` from inside it with the Railway CLI).
2. In Railway: **New Project → Deploy from GitHub repo** → pick the repo. Railway detects Node and runs `npm start` automatically.
3. Open the service's **Settings → Networking → Generate Domain** to get a public URL, or add your own domain there.

### Keep waitlist signups (recommended)

Railway's disk is wiped on every redeploy, so give the signups a permanent home:

1. On the service, **Add Volume** and mount it at `/data`.
2. Under **Variables**, add `DATA_DIR=/data`.

### Download signups

Add a variable `ADMIN_KEY` with a long random value, then visit:

```
https://YOUR-DOMAIN/admin/waitlist.csv?key=YOUR_ADMIN_KEY
```

Every new signup is also printed in the service's deploy logs.

## Before launch

Replace the two placeholders in `public/index.html`:

- `[PRICE]` — your per-verification price
- `[YOUR EMAIL]` — your contact email (appears twice in the footer link)

## Run locally

```
npm start
```

Then open http://localhost:3000.
