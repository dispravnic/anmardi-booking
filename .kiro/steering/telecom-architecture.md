---
name: telecom-architecture
description: Architecture standards for Asterisk, Yeastar SIM Gateways, Fastify, and Angular 20+
inclusion: auto
---

# Telecom System Architecture & Rules

## 1. Network & Ports Configuration
- **Asterisk SIP UDP:** Always bind on `5060`.
- **Asterisk RTP Range:** `10000-10099/udp`.
- **Fastify Backend API:** Runs on `3000`.
- **Mock Yeastar Gateway:** Runs on `8080`.
- **Angular Dev / Nginx Container:** Runs on `4200` (mapped to 80 in Docker).

## 2. Code Standards & Patterns
- **Backend Framework:** Fastify using ES Modules (`"type": "module"`).
- **Frontend Framework:** Angular standalone components using Signals (`signal()`), `inject()`, and `@angular/google-maps`.
- **Yeastar CGI API Protocol:**
  - Endpoint: `GET /cgi/WebCGI`
  - Query parameters: `account`, `password`, `port` (SIM slot 1-16), `destination` (phone), `content` (SMS text).
  - Valid hardware response MUST contain: `Response: SUCCESS, Message Sent via SIM`.
- **Asterisk Session Management:**
  - Context for outbound test originates: `[from-booking-app]`
  - PJSIP channel target format: `PJSIP/${targetPhone}@yeastar-gateway`

## 3. Environment & Docker Isolation
- Default Yeastar gateway IP to `http://mock-yeastar:8080` inside Docker, falling back to `http://localhost:8080` for local dev.
- Support override via environment variable `YEASTAR_GATEWAY_URL` for physical hardware (`http://192.168.1.200`).
- Containerization uses multi-stage Nginx builds for Angular and unified `docker-compose.yml` orchestration.

## 4. Google Maps & EV Charger Spot Booking Module
- Render Google Map centered on Bucharest (`lat: 44.4323, lng: 26.1063`).
- Include pins for Bucharest EV Charging Stations (iHunt EV Charging Station, Stație de încărcare E.ON Drive Public ParkLake, Renovatio e-charge, Plugpoint Charging Station).
- Selecting a station pin populates the Booking Card.
- Route `POST /api/ev-bookings/create` receives `{ stationName, date, time, targetPhone, simSlot }`, saves the booking, formats an SMS, and dispatches it through the specified SIM slot.