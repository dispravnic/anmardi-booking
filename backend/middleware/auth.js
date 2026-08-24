/**
 * middleware/auth.js — JWT authentication & role-based authorization
 *
 * Provides:
 *   authenticate  — Fastify preHandler that verifies JWT from Authorization header
 *   requireRole   — Factory that returns a preHandler restricting to specific roles
 *
 * Usage in routes:
 *   { preHandler: [authenticate] }                    — any logged-in user
 *   { preHandler: [authenticate, requireRole('provider')] }  — providers only
 *   { preHandler: [authenticate, requireRole('client', 'provider')] } — either
 */

/**
 * Verify JWT token from `Authorization: Bearer <token>` header.
 * On success, attaches decoded payload to `request.user`:
 *   { id, email, role, businessType }
 */
export async function authenticate(request, reply) {
  try {
    const decoded = await request.jwtVerify();
    request.user = decoded;
  } catch (err) {
    reply.code(401).send({
      success: false,
      error: 'Unauthorized — invalid or missing token',
      details: err.message,
    });
  }
}

/**
 * Factory: returns a preHandler that checks request.user.role against allowed roles.
 *
 * @param  {...string} allowedRoles — 'client', 'provider', or both
 * @returns {Function} Fastify preHandler
 *
 * @example
 *   { preHandler: [authenticate, requireRole('provider')] }
 */
export function requireRole(...allowedRoles) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized — authenticate first',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({
        success: false,
        error: `Forbidden — requires role: ${allowedRoles.join(' or ')}`,
        yourRole: request.user.role,
      });
    }
  };
}
