/**
 * MockProvider.js — Console-only mock for offline development
 * Implements ISmsProvider interface.
 *
 * Activated when MOCK_SMS=true or when no real provider credentials are set.
 * Logs full payload to stdout — never hits the network.
 */

import { ISmsProvider } from './ISmsProvider.js';

export class MockProvider extends ISmsProvider {
  get name() {
    return 'mock';
  }

  async sendSms({ to, message }) {
    const sid = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const border = '─'.repeat(56);
    console.log(`\n┌${border}┐`);
    console.log(`│  📱  MOCK SMS PROVIDER${' '.repeat(33)}│`);
    console.log(`├${border}┤`);
    console.log(`│  To      : ${to.padEnd(43)}│`);
    console.log(`│  SID     : ${sid.padEnd(43)}│`);
    console.log(`├${border}┤`);
    console.log(`│  Message :${' '.repeat(45)}│`);

    // Word-wrap at 52 chars
    const words = message.replace(/\n/g, ' ↵ ').split(' ');
    let line = '';
    for (const word of words) {
      if ((line + word).length > 52) {
        console.log(`│    ${line.trimEnd().padEnd(52)}│`);
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim()) console.log(`│    ${line.trimEnd().padEnd(52)}│`);

    console.log(`├${border}┤`);
    console.log(`│  Status  : ✅ queued (mock)${' '.repeat(28)}│`);
    console.log(`└${border}┘\n`);

    return {
      success:  true,
      sid,
      status:   'queued',
      provider: this.name,
    };
  }
}
