/**
 * TwilioProvider.js — Real SMS via Twilio REST API
 * Implements ISmsProvider interface.
 *
 * Env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 */

import twilio from 'twilio';
import { ISmsProvider } from './ISmsProvider.js';

export class TwilioProvider extends ISmsProvider {
  #client;
  #from;

  constructor() {
    super();
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.#from  = process.env.TWILIO_FROM_NUMBER;

    if (!sid || !token || !this.#from) {
      throw new Error(
        'TwilioProvider: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER',
      );
    }

    this.#client = twilio(sid, token);
  }

  get name() {
    return 'twilio';
  }

  async sendSms({ to, message }) {
    const result = await this.#client.messages.create({
      from: this.#from,
      to,
      body: message,
    });

    return {
      success:  true,
      sid:      result.sid,
      status:   result.status,
      provider: this.name,
    };
  }
}
