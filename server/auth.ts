// PIN hashing + signed session cookie, using only Web Crypto (available in Workers).
//
// The PIN is stored as a salted PBKDF2-SHA256 hash. bcrypt/argon2 in pure JS exceed the
// CPU budget of the Cloudflare free tier, so the built-in KDF is used instead.

const enc = new TextEncoder();
const ITERATIONS = 20000;
export const COOKIE = 'kfl_session';
export const SESSION_DAYS = 365;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const hash = await pbkdf2(pin, unb64(parts[2]), iterations);
  return timingSafeEqual(hash, unb64(parts[3]));
}

export function newSecret(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))));
}

/** Token = pinVersion.expiresAtSeconds.signature */
export async function makeToken(pinVersion: number, secret: string, nowMs: number): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_DAYS * 86400;
  const payload = `${pinVersion}.${exp}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function checkToken(token: string | null, pinVersion: number, secret: string | null, nowMs: number): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [ver, exp, sig] = parts;
  if (Number(ver) !== pinVersion) return false; // changing the PIN bumps the version
  if (!(Number(exp) * 1000 > nowMs)) return false;
  const expected = await sign(`${ver}.${exp}`, secret);
  return timingSafeEqual(enc.encode(sig), enc.encode(expected));
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
