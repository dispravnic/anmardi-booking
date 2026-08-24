/**
 * yeastarService.js
 * Sends SMS through the Yeastar TG1600 GSM Gateway via its HTTP CGI API.
 *
 * Steering rules applied:
 *  - Endpoint: GET /cgi/WebCGI
 *  - Query params: account, password, port (SIM slot 1-16), destination, content
 *  - content MUST be encoded with encodeURIComponent()
 *  - Valid hardware response contains: "Response: SUCCESS, Message Sent via SIM"
 *  - Default gateway URL: http://mock-yeastar:8080
 *  - Override via YEASTAR_GATEWAY_URL env var for physical hardware
 */

import { request } from 'undici';

const GATEWAY_URL = process.env.YEASTAR_GATEWAY_URL ?? 'http://localhost:8080';
const ACCOUNT     = process.env.YEASTAR_ACCOUNT  ?? 'admin';
const PASSWORD    = process.env.YEASTAR_PASSWORD  ?? 'admin123';

const SUCCESS_MARKER = 'Response: SUCCESS, Message Sent via SIM';

/**
 * Send an SMS via the Yeastar TG1600 CGI interface.
 *
 * @param {{ port: number, destination: string, content: string }} options
 *   port        — SIM slot (1-16)
 *   destination — E.164 phone number (e.g. "+40712345678")
 *   content     — plain-text SMS body (will be encodeURIComponent'd)
 *
 * @returns {Promise<{ success: boolean, raw: string, port: number, destination: string }>}
 * @throws  if the HTTP request fails or the gateway returns a non-success body
 */
export async function sendSms({ port, destination, content }) {
  if (port < 1 || port > 16) {
    throw new RangeError(`SIM port must be between 1 and 16, got ${port}`);
  }

  // Build CGI URL exactly as specified in the Yeastar skill:
  // http://<GATEWAY_IP>/cgi/WebCGI?1500101=account=<USER>&password=<PASS>
  //   &port=<PORT>&destination=<PHONE>&content=<ENCODED_TEXT>
  const encodedContent = encodeURIComponent(content);
  const url =
    `${GATEWAY_URL}/cgi/WebCGI` +
    `?1500101=account=${encodeURIComponent(ACCOUNT)}` +
    `&password=${encodeURIComponent(PASSWORD)}` +
    `&port=${port}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&content=${encodedContent}`;

  let raw = '';
  try {
    const { statusCode, body } = await request(url, { method: 'GET' });
    raw = await body.text();

    if (statusCode !== 200) {
      throw new Error(`Gateway returned HTTP ${statusCode}: ${raw}`);
    }
  } catch (err) {
    // Re-throw with context so the caller can log it properly
    throw new Error(`Yeastar CGI request failed — ${err.message}`);
  }

  const success = raw.includes(SUCCESS_MARKER);

  if (!success) {
    throw new Error(`SMS not confirmed by gateway. Raw response: ${raw}`);
  }

  return { success: true, raw, port, destination };
}
