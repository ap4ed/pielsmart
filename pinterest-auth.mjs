/**
 * Pinterest OAuth v5 — get an access token with pins:write scope
 *
 * Setup (one time):
 *   1. Add http://localhost:8080/callback as Redirect URI in your Pinterest app
 *   2. Create a .env file with:
 *        PINTEREST_APP_ID=1622305
 *        PINTEREST_APP_SECRET=your_secret_here
 *   3. Run: node pinterest-auth.mjs
 *   4. Authorize in the browser that opens
 *   5. Token is saved to .env as PINTEREST_TOKEN
 *
 * After running, use the token with:
 *   PINTEREST_TOKEN=... node pinterest-api.mjs
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length) env[k.trim()] = v.join('=').trim();
    }
  }
  return env;
}

function saveToken(token) {
  let content = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  if (content.includes('PINTEREST_TOKEN=')) {
    content = content.replace(/PINTEREST_TOKEN=.*/g, `PINTEREST_TOKEN=${token}`);
  } else {
    content = content.trimEnd() + `\nPINTEREST_TOKEN=${token}\n`;
  }
  writeFileSync('.env', content);
}

const env = loadEnv();
const APP_ID = env.PINTEREST_APP_ID || process.env.PINTEREST_APP_ID;
const APP_SECRET = env.PINTEREST_APP_SECRET || process.env.PINTEREST_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error('❌ Missing credentials. Create a .env file with:');
  console.error('   PINTEREST_APP_ID=1622305');
  console.error('   PINTEREST_APP_SECRET=your_secret_here');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = 'boards:read,pins:write,user_accounts:read';
const STATE = Math.random().toString(36).slice(2);

// ── Build auth URL ─────────────────────────────────────────────────────────────
const authUrl = `https://www.pinterest.com/oauth/?` +
  `client_id=${APP_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${SCOPES}` +
  `&state=${STATE}`;

// ── Start local server to capture callback ────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8080');
  if (url.pathname !== '/callback') {
    res.end('Not found'); return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`<h1>❌ Authorization denied: ${error}</h1>`);
    console.error(`\n❌ Authorization denied: ${error}`);
    server.close();
    return;
  }

  if (returnedState !== STATE) {
    res.end('<h1>❌ State mismatch — possible CSRF</h1>');
    console.error('\n❌ State mismatch');
    server.close();
    return;
  }

  console.log('\n✅ Authorization code received. Exchanging for token...');

  // Exchange code for access token
  const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    res.end(`<h1>❌ Token exchange failed</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
    console.error('\n❌ Token exchange failed:', tokenData);
    server.close();
    return;
  }

  const token = tokenData.access_token;
  saveToken(token);

  res.end(`
    <h1>✅ PielSmart Pinterest conectado</h1>
    <p>Token guardado en .env como PINTEREST_TOKEN</p>
    <p>Puedes cerrar esta ventana y volver a la terminal.</p>
  `);

  console.log('\n✅ Token guardado en .env como PINTEREST_TOKEN');
  console.log('\nAhora corre:');
  console.log('  node pinterest-api.mjs\n');

  server.close();
});

server.listen(8080, () => {
  console.log('🔐 Abriendo Pinterest para autorización...');
  console.log(`   Scopes: ${SCOPES}\n`);

  // Open browser
  const open = process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${open} "${authUrl}"`);

  console.log('⏳ Esperando autorización en el navegador...');
  console.log('   (Si el navegador no abre, visita esta URL manualmente:)');
  console.log(`   ${authUrl}\n`);
});
