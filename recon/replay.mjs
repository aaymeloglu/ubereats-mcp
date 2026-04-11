// Recon replay script. Fill in the constants below from a live browser session
// (see ../README.md section "Troubleshooting" for how to capture). DO NOT commit
// real cookies.
import { Impit, Browser } from 'impit';
import fs from 'fs';

const snap = JSON.parse(fs.readFileSync('./session_snapshot.json', 'utf8'));

const impit = new Impit({ browser: Browser.Chrome, ignoreTlsErrors: false });

const headers = {
  'content-type': 'application/json',
  'cookie': snap.cookie,
  'user-agent': snap.userAgent,
  'x-csrf-token': snap.csrfToken ?? 'x',
  'x-uber-client-gitref': snap.clientGitref ?? '',
  'accept': '*/*',
  'accept-language': snap.acceptLanguage ?? 'en-US',
  'origin': snap.origin ?? 'https://www.ubereats.com',
  'referer': snap.referer ?? 'https://www.ubereats.com/orders',
  // NOTE: we intentionally OMIT x-uber-session-id, x-uber-ciid, x-uber-request-id.
  // The captured ones were scoped to that specific browser session and request.
  // If the call fails, we'll add them back with either the captured values or
  // fresh UUIDs.
};

console.log('Replaying getPastOrdersV1 via impit...');
console.log('Cookie length:', snap.cookie?.length);
console.log('');

const res = await impit.fetch('https://www.ubereats.com/_p/api/getPastOrdersV1', {
  method: 'POST',
  headers,
  body: JSON.stringify({ lastWorkflowUUID: '' }),
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Response length:', text.length);
console.log('First 500 chars:', text.slice(0, 500));

if (text.trimStart().startsWith('<')) {
  console.error('');
  console.error('❌ RESPONSE IS HTML — WAF CHALLENGE OR ERROR PAGE');
  process.exit(1);
}

try {
  const parsed = JSON.parse(text);
  if (parsed.status === 'success' && parsed.data) {
    const orderCount = Object.keys(parsed.data.ordersMap ?? {}).length;
    console.log('');
    console.log('✅ PASS — got', orderCount, 'orders back');
  } else {
    console.error('');
    console.error('❌ JSON but not success:', JSON.stringify(parsed).slice(0, 500));
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Non-JSON response:', e.message);
  process.exit(1);
}
