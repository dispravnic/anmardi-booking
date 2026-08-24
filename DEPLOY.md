# AnMardi EV Booking — Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Render Cloud                         │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  anmardi-frontend │    │      anmardi-backend         │   │
│  │  Nginx / Angular  │───▶│   Fastify / Node 20          │   │
│  │  :80 → HTTPS      │    │   :3000 → HTTPS              │   │
│  └──────────────────┘    └──────────┬───────────────────┘   │
│                                     │                       │
│                           ┌─────────▼──────────┐           │
│                           │    mock-yeastar     │           │
│                           │  Node CGI Gateway   │           │
│                           │  :8080              │           │
│                           └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Twilio API       │
                    │  (real SMS)        │
                    └────────────────────┘
```

---

## 1 — Prerequisites

| Tool | Version |
|---|---|
| Git | any |
| GitHub account | — |
| Render account | free — https://render.com |
| Twilio account | free trial — https://twilio.com |

---

## 2 — Push to GitHub

```bash
cd c:\projects\anmardi-booking
git init
git add .
git commit -m "Initial commit — EV Booking full stack"
git remote add origin https://github.com/YOUR_USERNAME/anmardi-booking.git
git push -u origin main
```

> Make sure `.env` is in `.gitignore` — **never push real credentials**.

---

## 3 — Deploy to Render via Blueprint

1. Go to **https://dashboard.render.com/blueprints**
2. Click **"New Blueprint Instance"**
3. Connect your GitHub repository
4. Render detects `render.yaml` automatically
5. Click **"Apply"** — all 3 services build and deploy

---

## 4 — Configure Environment Variables in Render Dashboard

After the first deploy, set these secrets in the Render Dashboard for the **`anmardi-backend`** service:

> Dashboard → anmardi-backend → Environment → Add Environment Variable

| Variable | Value | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `your-twilio-account-sid` | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | `your-twilio-auth-token` | From Twilio Console |
| `TWILIO_FROM_NUMBER` | `+1XXXXXXXXXX` | Your Twilio number |
| `CORS_ORIGIN` | `https://anmardi-frontend.onrender.com` | Your frontend Render URL |
| `YEASTAR_GATEWAY_URL` | `https://mock-yeastar.onrender.com` | Mock; replace with real HW IP |
| `NODE_ENV` | `production` | — |
| `PORT` | `3000` | — |

For the **`anmardi-frontend`** service:

| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://anmardi-backend.onrender.com` |
| `API_BASE_URL` | `https://anmardi-backend.onrender.com/api` |

After setting all variables, click **"Manual Deploy → Deploy latest commit"** to restart with the new values.

---

## 5 — Service URLs (after deploy)

| Service | Public URL |
|---|---|
| Frontend | `https://anmardi-frontend.onrender.com` |
| Backend API | `https://anmardi-backend.onrender.com` |
| Backend health | `https://anmardi-backend.onrender.com/health` |
| Mock Yeastar | `https://mock-yeastar.onrender.com` |

---

## 6 — CI/CD — Auto Deploy on Push

Render auto-deploys on every push to `main` by default.
To trigger manually:

```bash
git add .
git commit -m "your change"
git push origin main
```

Render detects the push → rebuilds Docker image → zero-downtime swap.

To deploy a specific branch:

1. Dashboard → anmardi-backend → Settings → Branch → change to `deploy`
2. Push to `deploy` branch to trigger production deploy only

---

## 7 — End-to-End SMS Verification

Once deployed, verify the full flow:

```bash
# 1. Hit the health endpoint
curl https://anmardi-backend.onrender.com/health

# 2. Fire a real booking
curl -X POST https://anmardi-backend.onrender.com/api/ev-bookings/create \
  -H "Content-Type: application/json" \
  -d '{
    "stationName": "iHunt EV Charging Station",
    "date": "2026-08-25",
    "time": "10:00",
    "targetPhone": "+40745031738",
    "simSlot": 1
  }'

# Expected response:
# {
#   "success": true,
#   "booking": { "id": 1, ... },
#   "sms": {
#     "success": true,
#     "sid": "SMxxxxxxxxxxxxxxxx",
#     "status": "queued",
#     "to": "+40745031738"
#   }
# }
```

SMS arrives on `+40745031738` within ~5 seconds:
```
EV spot at iHunt EV Charging Station confirmed for 2026-08-25 10:00. Ref #1
```

---

## 8 — Switch to Real Yeastar TG1600 Hardware

To use your physical gateway instead of the mock:

1. In Render Dashboard → `anmardi-backend` → Environment
2. Set `YEASTAR_GATEWAY_URL` = `http://YOUR_GATEWAY_IP` (e.g. `http://192.168.1.200`)
3. Redeploy — SMS now routes through the real SIM card

> Note: the Yeastar gateway must be publicly reachable from Render's egress IPs,
> or you must expose it via a tunnel (e.g. ngrok, Cloudflare Tunnel).

---

## 9 — Local Development

```bash
# Start all services locally
docker compose up --build -d

# Frontend (with hot reload)
cd frontend
npm run start

# Verify backend
curl http://localhost:3000/health

# Verify mock Yeastar
curl http://localhost:8080/health
```

Local URLs:
- Frontend: http://localhost:4200
- Backend:  http://localhost:3000
- Mock:     http://localhost:8080

---

## 10 — Secrets Reference

| Secret | Where set | Used by |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Render env / `.env` | backend/twilioService.js |
| `TWILIO_AUTH_TOKEN` | Render env / `.env` | backend/twilioService.js |
| `TWILIO_FROM_NUMBER` | Render env / `.env` | backend/twilioService.js |
| `CORS_ORIGIN` | Render env / `.env` | backend/server.js |
| `YEASTAR_GATEWAY_URL` | Render env / `.env` | backend/yeastarService.js |
| `BACKEND_URL` | Render env | frontend/nginx.conf (proxy) |
| `API_BASE_URL` | Render env | frontend/index.html (window.__env) |

> **Never commit `.env` to git.** It is listed in `.gitignore`.
