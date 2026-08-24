/**
 * SmsService.js — Factory that selects the correct SMS provider
 * based on environment configuration.
 *
 * Priority:
 *   1. MOCK_SMS=true          → MockProvider (console logging only)
 *   2. TWILIO_ACCOUNT_SID set → TwilioProvider (real Twilio SMS)
 *   3. YEASTAR_GATEWAY_URL set → YeastarProvider (real GSM gateway)
 *   4. fallback               → MockProvider
 *
 * Usage:
 *   import { smsService } from './services/sms/SmsService.js';
 *   await smsService.send({ to: '+40745031738', message: 'Hello!' });
 */

import { TwilioProvider }  from './TwilioProvider.js';
import { YeastarProvider } from './YeastarProvider.js';
import { MockProvider }    from './MockProvider.js';

class SmsService {
  /** @type {import('./ISmsProvider.js').ISmsProvider} */
  #provider;

  constructor() {
    this.#provider = this.#resolveProvider();
    console.log(`[SmsService] Active provider: ${this.#provider.name}`);
  }

  /** @returns {string} Name of the active provider */
  get providerName() {
    return this.#provider.name;
  }

  /**
   * Send SMS using the active provider.
   *
   * @param {{ to: string, message: string, port?: number }} options
   * @returns {Promise<{ success: boolean, sid?: string, status?: string, provider: string }>}
   */
  async send({ to, message, port }) {
    return this.#provider.sendSms({ to, message, port });
  }

  /**
   * Resolve provider based on env vars.
   * @returns {import('./ISmsProvider.js').ISmsProvider}
   */
  #resolveProvider() {
    // 1. Explicit mock mode
    if (process.env.MOCK_SMS === 'true') {
      return new MockProvider();
    }

    // 2. Twilio (development / cloud deploy)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        return new TwilioProvider();
      } catch (err) {
        console.warn(`[SmsService] Twilio init failed: ${err.message} — falling back`);
      }
    }

    // 3. Yeastar (production GSM gateway)
    if (process.env.YEASTAR_GATEWAY_URL && process.env.YEASTAR_GATEWAY_URL !== 'http://mock-yeastar:8080') {
      try {
        return new YeastarProvider();
      } catch (err) {
        console.warn(`[SmsService] Yeastar init failed: ${err.message} — falling back`);
      }
    }

    // 4. Default fallback
    return new MockProvider();
  }
}

// Singleton export
export const smsService = new SmsService();
