/**
 * authService.js — Registration, login, JWT token generation
 *
 * Uses:
 *   - bcryptjs for password hashing
 *   - @fastify/jwt for token signing (registered on the Fastify instance)
 *   - db/schema.js prepared statements for user persistence
 *
 * JWT payload includes: { id, email, role, businessType }
 */

import bcrypt from 'bcryptjs';
import { stmts } from '../db/schema.js';

const SALT_ROUNDS = 10;

// Valid enums (matching DB CHECK constraints)
const VALID_ROLES          = ['client', 'provider'];
const VALID_BUSINESS_TYPES = ['hotel', 'ev_charger', 'petrol_station', 'airbnb'];

/**
 * Register a new user.
 *
 * @param {object} data
 * @param {string} data.email
 * @param {string} data.password
 * @param {'client'|'provider'} data.role
 * @param {string} data.firstName
 * @param {string} data.lastName
 * @param {string} [data.phoneNumber]
 * @param {string} [data.businessName]     — required if role=provider
 * @param {string} [data.businessType]     — required if role=provider
 * @param {string} [data.businessEmail]    — optional provider contact
 *
 * @returns {{ user: object }} created user (no password_hash)
 * @throws {Error} on validation failure or duplicate email
 */
export async function registerUser(data) {
  const {
    email, password, role, firstName, lastName,
    phoneNumber, businessName, businessType, businessEmail,
  } = data;

  // ── Validate ─────────────────────────────────────────────
  if (!email || !password || !role || !firstName || !lastName) {
    throw Object.assign(new Error('Missing required fields: email, password, role, firstName, lastName'), { statusCode: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role: "${role}". Must be client or provider.`), { statusCode: 400 });
  }

  if (role === 'provider') {
    if (!businessName || !businessType) {
      throw Object.assign(new Error('Provider registration requires businessName and businessType'), { statusCode: 400 });
    }
    if (!VALID_BUSINESS_TYPES.includes(businessType)) {
      throw Object.assign(new Error(`Invalid businessType: "${businessType}". Must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`), { statusCode: 400 });
    }
    if (!phoneNumber) {
      throw Object.assign(new Error('Provider registration requires phoneNumber for SMS delivery'), { statusCode: 400 });
    }
  }

  // ── Check uniqueness ─────────────────────────────────────
  const existing = stmts.findUserByEmail.get(email);
  if (existing) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  // ── Hash password ────────────────────────────────────────
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // ── Insert ───────────────────────────────────────────────
  const result = stmts.insertUser.run({
    email,
    passwordHash,
    role,
    firstName,
    lastName,
    phoneNumber:   phoneNumber   ?? null,
    businessName:  role === 'provider' ? businessName  : null,
    businessType:  role === 'provider' ? businessType  : null,
    businessEmail: role === 'provider' ? (businessEmail ?? null) : null,
  });

  const user = stmts.findUserById.get(result.lastInsertRowid);
  return { user: sanitizeUser(user) };
}

/**
 * Login — verify credentials and return JWT-ready payload.
 *
 * @param {{ email: string, password: string }} credentials
 * @returns {{ user: object }} authenticated user (no password_hash)
 * @throws {Error} on invalid credentials
 */
export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw Object.assign(new Error('Email and password required'), { statusCode: 400 });
  }

  const user = stmts.findUserByEmail.get(email);
  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  return { user: sanitizeUser(user) };
}

/**
 * Build JWT payload from user row.
 * @param {object} user — sanitized user object
 * @returns {{ id: number, email: string, role: string, businessType: string|null }}
 */
export function buildTokenPayload(user) {
  return {
    id:           user.id,
    email:        user.email,
    role:         user.role,
    businessType: user.business_type ?? null,
  };
}

/**
 * Get user by ID (for /me endpoint).
 * @param {number} id
 * @returns {object|null} sanitized user or null
 */
export function getUserById(id) {
  const user = stmts.findUserById.get(id);
  return user ? sanitizeUser(user) : null;
}

// ── Helpers ─────────────────────────────────────────────────

/** Strip password_hash from user object before returning to client */
function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}
