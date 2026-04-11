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
  'x-csrf-token': 'x',
  'x-uber-client-gitref': snap.clientGitref ?? '',
  'accept': '*/*',
  'accept-language': snap.acceptLanguage ?? 'en-US',
  'origin': 'https://www.ubereats.com',
  'referer': 'https://www.ubereats.com/',
};

// Deliberately bogus: a shoppingCartItem with a fake uuid. Should fail validation
// without creating any real draft order on Andy's account.
const body = {
  isMulticart: true,
  shoppingCartItems: [
    {
      uuid: 'bogus-item-uuid-0000',
      storeUuid: 'bogus-store-uuid-0000',
      shoppingCartItemUuid: 'bogus-cart-item-0000',
      sectionUuid: 'bogus-section',
      subsectionUuid: 'bogus-subsection',
      title: 'Deliberately Invalid Test Item',
      price: 100,
      quantity: 1,
      specialInstructions: '',
      customizations: {},
    },
  ],
};

console.log('Dry-run createDraftOrderV2 with bogus items via impit...');

const res = await impit.fetch('https://www.ubereats.com/_p/api/createDraftOrderV2', {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

console.log('Status:', res.status);
const text = await res.text();
console.log('Response length:', text.length);
console.log('First 800 chars:', text.slice(0, 800));

if (text.trimStart().startsWith('<')) {
  console.error('\n❌ RESPONSE IS HTML — WAF CHALLENGE');
  process.exit(1);
}

try {
  const parsed = JSON.parse(text);
  console.log('\nParsed status field:', parsed.status);
  if (parsed.status === 'failure' || parsed.data?.error || parsed.meta?.code) {
    console.log('✅ PASS — write endpoint reachable, validation rejected bogus input');
  } else if (parsed.status === 'success') {
    console.log('⚠️  Unexpected SUCCESS — a draft order may have been created with bogus data');
    console.log('   This means Uber is very lenient, OR bogus items got silently dropped.');
    console.log('   Check ubereats.com/cart to see if anything landed.');
  } else {
    console.log('?? unexpected shape');
  }
} catch (e) {
  console.error('❌ Non-JSON response:', e.message);
  process.exit(1);
}
