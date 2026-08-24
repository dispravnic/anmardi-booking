/**
 * asteriskService.js
 * Interacts with Asterisk via the AMI (Asterisk Manager Interface).
 *
 * Steering rules applied:
 *  - Context for outbound originates: [from-booking-app]
 *  - PJSIP channel target format: PJSIP/${targetPhone}@yeastar-gateway
 *  - AMI connects on ASTERISK_HOST:ASTERISK_PORT (default asterisk:5038)
 */

import AsteriskManager from 'asterisk-manager';

const AMI_HOST   = process.env.ASTERISK_HOST       ?? 'asterisk';
const AMI_PORT   = parseInt(process.env.ASTERISK_PORT ?? '5038', 10);
const AMI_USER   = process.env.ASTERISK_AMI_USER    ?? 'admin';
const AMI_SECRET = process.env.ASTERISK_AMI_SECRET  ?? 'secret';

/**
 * Create a short-lived AMI connection, run one action, then disconnect.
 * Using a per-request connection avoids stale socket issues in long-running containers.
 *
 * @param {object} action  — AMI action object
 * @returns {Promise<object>} resolved with the AMI response object
 */
function amiAction(action) {
  return new Promise((resolve, reject) => {
    // connect(port, host, user, secret, events)
    const ami = new AsteriskManager(AMI_PORT, AMI_HOST, AMI_USER, AMI_SECRET, false);
    ami.keepConnected();

    const timeout = setTimeout(() => {
      ami.disconnect();
      reject(new Error('AMI action timed out after 10 s'));
    }, 10_000);

    ami.on('connect', () => {
      ami.action(action, (err, response) => {
        clearTimeout(timeout);
        ami.disconnect();
        if (err) return reject(new Error(`AMI error: ${JSON.stringify(err)}`));
        resolve(response);
      });
    });

    ami.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`AMI connection error: ${err.message}`));
    });
  });
}

/**
 * Originate a test voice call to targetPhone through the Yeastar gateway.
 *
 * Uses context [from-booking-app] and channel format
 * PJSIP/<targetPhone>@yeastar-gateway as per steering rules.
 *
 * @param {string} targetPhone — E.164 number (e.g. "+40712345678")
 * @returns {Promise<object>} AMI response
 */
export async function originateCall(targetPhone) {
  if (!targetPhone || targetPhone.length < 5) {
    throw new TypeError(`Invalid targetPhone: "${targetPhone}"`);
  }

  const action = {
    action: 'Originate',
    channel: `PJSIP/${targetPhone}@yeastar-gateway`,
    context: 'from-booking-app',
    exten: targetPhone,
    priority: 1,
    callerid: 'EVBooking <0000000000>',
    timeout: 30000,  // ms — how long to wait for answer
    async: 'true',
  };

  return amiAction(action);
}
