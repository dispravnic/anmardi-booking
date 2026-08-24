/**
 * ISmsProvider.js — SMS Provider Interface (Strategy Pattern)
 *
 * All SMS providers must implement:
 *   sendSms({ to: string, message: string }) → Promise<{ success, sid?, status?, provider }>
 *
 * This file serves as documentation / type contract.
 * ES Modules don't have interfaces, so we use a base class with throw-if-not-overridden.
 */

export class ISmsProvider {
  /** @type {string} Provider name identifier */
  get name() {
    throw new Error('ISmsProvider.name must be implemented');
  }

  /**
   * Send an SMS message.
   *
   * @param {{ to: string, message: string }} options
   * @returns {Promise<{ success: boolean, sid?: string, status?: string, provider: string, raw?: string }>}
   */
  async sendSms({ to, message }) {
    throw new Error('ISmsProvider.sendSms() must be implemented');
  }
}
