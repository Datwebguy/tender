import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
console.log('Set this as the TENDER_SIGNING_KEY environment variable (keep it secret):\n');
console.log(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
console.log('\nPublic key (safe to publish, also served at /api/pubkey):\n');
console.log(publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
