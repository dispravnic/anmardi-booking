/**
 * YeastarProvider.js — Production SMS via Yeastar TG1600 GSM Gateway CGI API
 * Implements ISmsProvider interface.
 *
 * Env vars:
 *   YEASTAR_GATEWAY_URL  — http://192.168.1.200 or http://mock-yeastar:8080
 *   YEASTAR_ACCOUNT      — gateway admin username
 *   YEASTAR_PASSWORD     — gateway admin password
 *   YEASTAR_DEFAULT_PORT — default SIM port (1-16), defaults to 1
 */

import { request } from 'undici';
import { ISmsProvider } from './ISmsProvider.js';

const SUCCESS_MARKER = 'Response: SUCCESS, Message Sent via SIM';

export class YeastarProvider extends ISmsProvider {
  #gatewayUrl;
  #account;
  #password;
  #defaultPort;

  constructor() {
    super();
    this.#gatewayUrl  = process.env.YEASTAR_GATEWAY_URL ?? 'http://localhost:8080';
    this.#account     = process.env.YEASTAR_ACCOUNT ?? 'admin';
    this.#password    = process.env.YEASTAR_PASSWORD ?? 'admin123';
    this.#defaultPort = parseInt(process.env.YEASTAR_DEFAULT_PORT ?? '1', 10);
  }

  get name() {
    return 'yeastar';
  }

  /**
   * @param {{ to: string, message: string, port?: number }} options
   */
  async sendSms({ to, message, port }) {
    const simPort = port ?? this.#defaultPort;

    if (simPort < 1 || simPort > 16) {
      throw new RangeError(`SIM port must be 1-16, got ${simPort}`);
    }

    // Build CGI URL per Yeastar TG1600 steering rules
    const encodedContent = encodeURIComponent(message);
    const url =
      `${this.#gatewayUrl}/cgi/WebCGI` +
      `?1500101=account=${encodeURIComponent(this.#account)}` +
      `&password=${encodeURIComponent(this.#password)}` +
      `&port=${simPort}` +
      `&destination=${encodeURIComponent(to)}` +
      `&content=${encodedContent}`;

    const { statusCode, body } = await request(url, { method: 'GET' });
    const raw = await body.text();

    if (statusCode !== 200) {
      throw new Error(`Yeastar HTTP ${statusCode}: ${raw}`);
    }

    if (!raw.includes(SUCCESS_MARKER)) {
      throw new Error(`Yeastar response not confirmed: ${raw}`);
    }

    return {
      success:  true,
      sid:      `yeastar-sim${simPort}-${Date.now()}`,
      status:   'sent',
      provider: this.name,
      raw,
    };
  }
}
