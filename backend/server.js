/**
 * server.js — Fastify EV Booking API v2
 * ES Modules, Fastify 4, port 3000
 *
 * Features:
 *   - JWT auth (register / login / me)
 *   - Role-based access (client / provider)
 *   - SMS notifications via Adapter Pattern (Twilio / Yeastar / Mock)
 *   - SQLite persistence via better-sqlite3
 *   - EV stations seed data
 *   - 16 SIM slot state
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';

import { registerUser, loginUser, buildTokenPayload, getUserById } from './services/authService.js';
import { smsService } from './services/sms/index.js';
import { originateCall } from './services/asteriskService.js';
import { stmts } from './db/schema.js';
import { authenticate, requireRole } from './middleware/auth.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'anmardi-dev-secret-change-in-prod';

// ── CORS origin ───────────────────────────────────────────────────────────────
const rawOrigin = process.env.CORS_ORIGIN ?? '*';
const corsOrigin = rawOrigin === '*'
  ? true
  : rawOrigin.split(',').map((o) => o.trim());

// ── Fastify instance ──────────────────────────────────────────────────────────
const app = Fastify({ logger: true });

await app.register(cors, {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

await app.register(jwt, { secret: JWT_SECRET });

// ══════════════════════════════════════════════════════════════════════════════
// STATE (legacy in-memory — kept for backward compat with SIM slot UI)
// ══════════════════════════════════════════════════════════════════════════════

const SIM_SLOTS = Object.fromEntries(
  Array.from({ length: 16 }, (_, i) => [
    `SIM_${i + 1}`,
    { port: i + 1, assignedTo: null, lastUsed: null },
  ]),
);

// ══════════════════════════════════════════════════════════════════════════════
// SEED DATA — Bucharest EV Charging Stations
// ══════════════════════════════════════════════════════════════════════════════
const EV_STATIONS = [
  { id: 1, name: 'iHunt EV Charging Station', address: 'Str. Biharia 67-77, București', lat: 44.4268, lng: 26.1025, connectors: 2, powerKw: 22 },
  { id: 2, name: 'Stație de încărcare E.ON Drive Public ParkLake', address: 'ParkLake Shopping Center, București', lat: 44.4391, lng: 26.1317, connectors: 4, powerKw: 50 },
  { id: 3, name: 'Renovatio e-charge', address: 'Calea Floreasca 169, București', lat: 44.4502, lng: 26.0856, connectors: 3, powerKw: 22 },
  { id: 4, name: 'Plugpoint Charging Station', address: 'Bd. Unirii 22, București', lat: 44.4189, lng: 26.0963, connectors: 2, powerKw: 11 },
];

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Health & Public
// ══════════════════════════════════════════════════════════════════════════════

app.get('/health', async () => ({
  status: 'ok',
  service: 'anmardi-booking-backend',
  smsProvider: smsService.providerName,
  ts: new Date().toISOString(),
}));

app.get('/api/sims', async () => ({ simSlots: SIM_SLOTS }));

app.get('/api/ev-stations', async () => ({ stations: EV_STATIONS }));

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Auth
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/auth/register ──────────────────────────────────────────────────
app.post('/api/auth/register', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password', 'role', 'firstName', 'lastName'],
      properties: {
        email:         { type: 'string', format: 'email' },
        password:      { type: 'string', minLength: 6 },
        role:          { type: 'string', enum: ['client', 'provider'] },
        firstName:     { type: 'string', minLength: 1 },
        lastName:      { type: 'string', minLength: 1 },
        phoneNumber:   { type: 'string' },
        businessName:  { type: 'string' },
        businessType:  { type: 'string', enum: ['hotel', 'ev_charger', 'petrol_station', 'airbnb'] },
        businessEmail: { type: 'string' },
      },
    },
  },
}, async (req, reply) => {
  try {
    const { user } = await registerUser(req.body);
    const payload = buildTokenPayload(user);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });

    reply.code(201).send({ success: true, token, user });
  } catch (err) {
    const status = err.statusCode ?? 500;
    reply.code(status).send({ success: false, error: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email:    { type: 'string' },
        password: { type: 'string' },
      },
    },
  },
}, async (req, reply) => {
  try {
    const { user } = await loginUser(req.body);
    const payload = buildTokenPayload(user);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });

    reply.send({ success: true, token, user });
  } catch (err) {
    const status = err.statusCode ?? 500;
    reply.code(status).send({ success: false, error: err.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
  const user = getUserById(req.user.id);
  if (!user) {
    return reply.code(404).send({ success: false, error: 'User not found' });
  }
  reply.send({ success: true, user });
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Bookings (authenticated)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/ev-bookings/create ─────────────────────────────────────────────
// Any authenticated user can create a booking (client or provider testing)
app.post('/api/ev-bookings/create', {
  preHandler: [authenticate],
  schema: {
    body: {
      type: 'object',
      required: ['stationName', 'date', 'time', 'targetPhone', 'simSlot'],
      properties: {
        stationName: { type: 'string', minLength: 1 },
        date:        { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        time:        { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        targetPhone: { type: 'string', minLength: 5 },
        simSlot:     { type: 'integer', minimum: 1, maximum: 16 },
        providerId:  { type: 'integer' },
      },
    },
  },
}, async (req, reply) => {
  const { stationName, date, time, targetPhone, simSlot, providerId } = req.body;
  const clientId = req.user.id;

  // ── Persist booking in SQLite ──────────────────────────────
  const result = stmts.insertBooking.run({
    clientId,
    providerId: providerId ?? null,
    stationName,
    businessType: 'ev_charger',
    date,
    time,
    targetPhone,
    simSlot,
  });

  const booking = stmts.findBookingById.get(result.lastInsertRowid);

  // ── Update SIM slot state ──────────────────────────────────
  const slotKey = `SIM_${simSlot}`;
  SIM_SLOTS[slotKey].assignedTo = targetPhone;
  SIM_SLOTS[slotKey].lastUsed = new Date().toISOString();

  app.log.info({ booking }, 'New EV booking created');

  // ── Format SMS ─────────────────────────────────────────────
  const smsContent = `EV spot at ${stationName} confirmed for ${date} ${time}. Ref #${booking.id}`;

  // ── Send SMS to client ─────────────────────────────────────
  let smsClientResult = { success: false, provider: 'none' };
  try {
    smsClientResult = await smsService.send({ to: targetPhone, message: smsContent, port: simSlot });
    app.log.info({ smsClientResult }, 'SMS sent to client');
  } catch (err) {
    app.log.error({ err }, 'SMS to client failed');
    smsClientResult = { success: false, error: err.message, provider: smsService.providerName };
  }

  // ── Send SMS to provider (if provider exists and has a phone) ──────────────
  let smsProviderResult = { success: false, provider: 'none' };
  if (providerId) {
    const provider = stmts.findUserById.get(providerId);
    if (provider?.phone_number) {
      const providerMsg = `New booking! ${stationName} on ${date} ${time}. Client phone: ${targetPhone}. Ref #${booking.id}`;
      try {
        smsProviderResult = await smsService.send({ to: provider.phone_number, message: providerMsg });
        app.log.info({ smsProviderResult }, 'SMS sent to provider');
      } catch (err) {
        app.log.error({ err }, 'SMS to provider failed');
        smsProviderResult = { success: false, error: err.message, provider: smsService.providerName };
      }
    }
  }

  // ── Update booking SMS tracking ────────────────────────────
  stmts.updateBookingSms.run({
    id: booking.id,
    smsClientSid:      smsClientResult.sid ?? null,
    smsProviderSid:    smsProviderResult.sid ?? null,
    smsClientStatus:   smsClientResult.success ? 'sent' : 'failed',
    smsProviderStatus: smsProviderResult.success ? 'sent' : (providerId ? 'failed' : 'none'),
  });

  reply.code(201).send({
    success: true,
    booking,
    sms: {
      client:   smsClientResult,
      provider: smsProviderResult,
    },
  });
});

// ── PUT /api/ev-bookings/:id/status ──────────────────────────────────────────
// Provider confirms or cancels a booking → triggers SMS to client
app.put('/api/ev-bookings/:id/status', {
  preHandler: [authenticate, requireRole('provider')],
  schema: {
    body: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['confirmed', 'cancelled'] },
      },
    },
  },
}, async (req, reply) => {
  const bookingId = parseInt(req.params.id, 10);
  const { status } = req.body;

  const booking = stmts.findBookingById.get(bookingId);
  if (!booking) {
    return reply.code(404).send({ success: false, error: 'Booking not found' });
  }

  // Update status
  stmts.updateBookingStatus.run({ id: bookingId, status });

  // Notify client via SMS
  const statusText = status === 'confirmed' ? 'CONFIRMED ✅' : 'CANCELLED ❌';
  const smsMsg = `Your booking #${bookingId} at ${booking.station_name} on ${booking.date} ${booking.time} has been ${statusText}`;

  let smsResult = { success: false };
  try {
    smsResult = await smsService.send({ to: booking.target_phone, message: smsMsg });
    app.log.info({ smsResult }, `Booking ${status} — SMS sent to client`);
  } catch (err) {
    app.log.error({ err }, `Booking ${status} — SMS to client failed`);
  }

  reply.send({ success: true, bookingId, status, sms: smsResult });
});

// ── GET /api/ev-bookings/my ──────────────────────────────────────────────────
// Returns bookings for the authenticated user based on their role
app.get('/api/ev-bookings/my', { preHandler: [authenticate] }, async (req, reply) => {
  const { id, role } = req.user;
  const bookings = role === 'provider'
    ? stmts.listBookingsByProvider.all(id)
    : stmts.listBookingsByClient.all(id);

  reply.send({ success: true, bookings });
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Provider management
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/providers ───────────────────────────────────────────────────────
// Public — list providers, optionally filtered by business_type
app.get('/api/providers', async (req, reply) => {
  const { type } = req.query;
  const providers = type
    ? stmts.listProvidersByType.all(type)
    : stmts.listProviders.all();

  // Sanitize — don't expose password hashes
  const safe = providers.map(({ password_hash, ...p }) => p);
  reply.send({ success: true, providers: safe });
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Telecom (legacy)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/telecom/trigger-call', {
  preHandler: [authenticate],
  schema: {
    body: {
      type: 'object',
      required: ['targetPhone'],
      properties: {
        targetPhone: { type: 'string', minLength: 5 },
        simSlot:     { type: 'integer', minimum: 1, maximum: 16 },
      },
    },
  },
}, async (req, reply) => {
  const { targetPhone, simSlot } = req.body;

  if (simSlot) {
    const slotKey = `SIM_${simSlot}`;
    SIM_SLOTS[slotKey].assignedTo = targetPhone;
    SIM_SLOTS[slotKey].lastUsed = new Date().toISOString();
  }

  try {
    const result = await originateCall(targetPhone);
    reply.send({ success: true, asterisk: result });
  } catch (err) {
    app.log.error({ err }, 'AMI originate call failed');
    reply.code(502).send({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════════

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Backend API listening on http://${HOST}:${PORT}`);
  app.log.info(`SMS Provider: ${smsService.providerName}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
