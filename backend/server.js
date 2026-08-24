/**
 * server.js — Fastify EV Booking API
 * ES Modules, Fastify 4, port 3000
 *
 * State:
 *   - 16 SIM card slots (SIM_1 … SIM_16) — each tracks current assignment
 *
 * Routes:
 *   GET  /api/sims                  — returns all 16 SIM slot assignments
 *   GET  /api/ev-stations           — returns seed data for Bucharest EV stations
 *   POST /api/ev-bookings/create    — save booking, format SMS, dispatch via Yeastar CGI
 *   POST /api/telecom/trigger-call  — originate Asterisk AMI call via yeastar-gateway
 */

import Fastify       from 'fastify';
import cors          from '@fastify/cors';
import { sendSms }       from './services/yeastarService.js';
import { sendTwilioSms } from './services/twilioService.js';
import { originateCall } from './services/asteriskService.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = '0.0.0.0';

// ── CORS origin ───────────────────────────────────────────────────────────────
// In production set CORS_ORIGIN to the Render frontend URL, e.g.:
//   https://anmardi-frontend.onrender.com
// Multiple origins comma-separated: "https://a.com,https://b.com"
const rawOrigin = process.env.CORS_ORIGIN ?? '*';
const corsOrigin = rawOrigin === '*'
  ? true
  : rawOrigin.split(',').map((o) => o.trim());

// ── Fastify instance ──────────────────────────────────────────────────────────
const app = Fastify({ logger: true });
await app.register(cors, {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════

/** 16 SIM slot entries — keyed SIM_1 … SIM_16 */
const SIM_SLOTS = Object.fromEntries(
  Array.from({ length: 16 }, (_, i) => [
    `SIM_${i + 1}`,
    { port: i + 1, assignedTo: null, lastUsed: null },
  ]),
);

/** In-memory bookings store (replace with DB in production) */
const bookings = [];

// ══════════════════════════════════════════════════════════════════════════════
// SEED DATA — Bucharest EV Charging Stations
// ══════════════════════════════════════════════════════════════════════════════
const EV_STATIONS = [
  {
    id: 1,
    name: 'iHunt EV Charging Station',
    address: 'Str. Biharia 67-77, București',
    lat: 44.4268,
    lng: 26.1025,
    connectors: 2,
    powerKw: 22,
  },
  {
    id: 2,
    name: 'Stație de încărcare E.ON Drive Public ParkLake',
    address: 'ParkLake Shopping Center, București',
    lat: 44.4391,
    lng: 26.1317,
    connectors: 4,
    powerKw: 50,
  },
  {
    id: 3,
    name: 'Renovatio e-charge',
    address: 'Calea Floreasca 169, București',
    lat: 44.4502,
    lng: 26.0856,
    connectors: 3,
    powerKw: 22,
  },
  {
    id: 4,
    name: 'Plugpoint Charging Station',
    address: 'Bd. Unirii 22, București',
    lat: 44.4189,
    lng: 26.0963,
    connectors: 2,
    powerKw: 11,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, reply) => {
  reply.send({ status: 'ok', service: 'anmardi-booking-backend', ts: new Date().toISOString() });
});

// ── GET /api/sims ─────────────────────────────────────────────────────────────
// Returns the current assignment state for all 16 SIM ports.
app.get('/api/sims', async (_req, reply) => {
  reply.send({ simSlots: SIM_SLOTS });
});

// ── GET /api/ev-stations ──────────────────────────────────────────────────────
// Returns the 4 pre-seeded Bucharest EV charging stations.
app.get('/api/ev-stations', async (_req, reply) => {
  reply.send({ stations: EV_STATIONS });
});

// ── POST /api/ev-bookings/create ──────────────────────────────────────────────
// Body: { stationName, date, time, targetPhone, simSlot }
app.post(
  '/api/ev-bookings/create',
  {
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
        },
      },
    },
  },
  async (req, reply) => {
    const { stationName, date, time, targetPhone, simSlot } = req.body;

    // Persist booking
    const booking = {
      id:          bookings.length + 1,
      stationName,
      date,
      time,
      targetPhone,
      simSlot,
      createdAt:   new Date().toISOString(),
    };
    bookings.push(booking);

    // Update SIM slot state
    const slotKey = `SIM_${simSlot}`;
    SIM_SLOTS[slotKey].assignedTo = targetPhone;
    SIM_SLOTS[slotKey].lastUsed   = booking.createdAt;

    app.log.info({ booking }, 'New EV booking created');

    // ── Format SMS per spec ───────────────────────────────────────────────
    const smsContent =
      `EV spot at ${stationName} confirmed for ${date} ${time}. Ref #${booking.id}`;

    // ── Dispatch via Twilio (real SMS) ───────────────────────────────────
    let smsResult;
    try {
      smsResult = await sendTwilioSms({ to: targetPhone, body: smsContent });
      app.log.info({ smsResult }, 'Twilio SMS dispatched');
    } catch (twilioErr) {
      app.log.warn({ twilioErr }, 'Twilio failed — falling back to Yeastar CGI');
      // ── Fallback: Yeastar TG1600 CGI ──────────────────────────────────
      try {
        const yeastarResult = await sendSms({
          port: simSlot, destination: targetPhone, content: smsContent,
        });
        smsResult = { ...yeastarResult, provider: 'yeastar' };
        app.log.info({ smsResult }, 'Yeastar SMS dispatched (fallback)');
      } catch (yeastarErr) {
        app.log.error({ yeastarErr }, 'Both SMS providers failed');
        smsResult = { success: false, error: yeastarErr.message, provider: 'none' };
      }
    }

    reply.code(201).send({
      success: true,
      booking,
      sms: smsResult,
    });
  },
);

// ── POST /api/telecom/trigger-call ────────────────────────────────────────────
// Triggers an Asterisk AMI originate call on behalf of the selected SIM.
// Body: { targetPhone, simSlot? }
app.post(
  '/api/telecom/trigger-call',
  {
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
  },
  async (req, reply) => {
    const { targetPhone, simSlot } = req.body;

    // Optionally tag the SIM slot as in-use for the call
    if (simSlot) {
      const slotKey = `SIM_${simSlot}`;
      SIM_SLOTS[slotKey].assignedTo = targetPhone;
      SIM_SLOTS[slotKey].lastUsed   = new Date().toISOString();
    }

    try {
      const result = await originateCall(targetPhone);
      reply.send({ success: true, asterisk: result });
    } catch (err) {
      app.log.error({ err }, 'AMI originate call failed');
      reply.code(502).send({ success: false, error: err.message });
    }
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────
try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Backend API listening on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
