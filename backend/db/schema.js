/**
 * schema.js — SQLite database initialization via better-sqlite3
 *
 * Tables:
 *   users    — role-based users (client / provider)
 *   bookings — reservation records with SMS notification status
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../data');
const DB_PATH = resolve(DB_DIR, 'anmardi.db');

// Ensure data directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════════════════════════════════════════════════════
// MIGRATIONS
// ══════════════════════════════════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('client', 'provider')),
    first_name    TEXT    NOT NULL,
    last_name     TEXT    NOT NULL,
    phone_number  TEXT,

    -- Provider-only fields (NULL for clients)
    business_name     TEXT,
    business_type     TEXT CHECK(business_type IN ('hotel', 'ev_charger', 'petrol_station', 'airbnb') OR business_type IS NULL),
    business_email    TEXT,

    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       INTEGER NOT NULL REFERENCES users(id),
    provider_id     INTEGER REFERENCES users(id),
    station_name    TEXT    NOT NULL,
    business_type   TEXT,
    date            TEXT    NOT NULL,
    time            TEXT    NOT NULL,
    target_phone    TEXT    NOT NULL,
    sim_slot        INTEGER DEFAULT 1,
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'cancelled')),

    -- SMS notification tracking
    sms_client_sid      TEXT,
    sms_provider_sid    TEXT,
    sms_client_status   TEXT DEFAULT 'none',
    sms_provider_status TEXT DEFAULT 'none',

    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
`);

// ══════════════════════════════════════════════════════════════════════════════
// PREPARED STATEMENTS (exported for reuse)
// ══════════════════════════════════════════════════════════════════════════════

export const stmts = {
  // Users
  insertUser: db.prepare(`
    INSERT INTO users (email, password_hash, role, first_name, last_name, phone_number,
                       business_name, business_type, business_email)
    VALUES (@email, @passwordHash, @role, @firstName, @lastName, @phoneNumber,
            @businessName, @businessType, @businessEmail)
  `),

  findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  listProviders: db.prepare(`SELECT * FROM users WHERE role = 'provider'`),
  listProvidersByType: db.prepare(`SELECT * FROM users WHERE role = 'provider' AND business_type = ?`),

  // Bookings
  insertBooking: db.prepare(`
    INSERT INTO bookings (client_id, provider_id, station_name, business_type, date, time,
                          target_phone, sim_slot)
    VALUES (@clientId, @providerId, @stationName, @businessType, @date, @time,
            @targetPhone, @simSlot)
  `),

  updateBookingStatus: db.prepare(`
    UPDATE bookings SET status = @status, updated_at = datetime('now') WHERE id = @id
  `),

  updateBookingSms: db.prepare(`
    UPDATE bookings
    SET sms_client_sid = @smsClientSid, sms_provider_sid = @smsProviderSid,
        sms_client_status = @smsClientStatus, sms_provider_status = @smsProviderStatus,
        updated_at = datetime('now')
    WHERE id = @id
  `),

  listBookingsByClient: db.prepare(`SELECT * FROM bookings WHERE client_id = ? ORDER BY created_at DESC`),
  listBookingsByProvider: db.prepare(`SELECT * FROM bookings WHERE provider_id = ? ORDER BY created_at DESC`),
  findBookingById: db.prepare(`SELECT * FROM bookings WHERE id = ?`),
};

export default db;
