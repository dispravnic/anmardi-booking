/**
 * twilioService.js
 * Sends real SMS via the Twilio REST API.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID   — from Twilio Console
 *   TWILIO_AUTH_TOKEN    — from Twilio Console
 *   TWILIO_FROM_NUMBER   — your Twilio phone number
 */

import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

/**
 * Send a real SMS via Twilio.
 *
 * @param {{ to: string, body: string }} options
 * @returns {Promise<{ success: boolean, sid: string, status: string, to: string }>}
 */
export async function sendTwilioSms({ to, body }) {
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio env vars missing — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER',
    );
  }

  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    from: fromNumber,
    to,
    body,
  });

  return {
    success: true,
    sid:     message.sid,
    status:  message.status,
    to:      message.to,
  };
}
