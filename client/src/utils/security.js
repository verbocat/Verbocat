const PIN_TO_ROLE = {
  "102030": "office",
  "894979": "linguist"
};

const SESSION_KEY = "screenlock_session";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function deriveKey(pin, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createSession(pin) {
  const role = PIN_TO_ROLE[pin];
  if (!role) return null;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt.buffer);

  const payload = JSON.stringify({ role, createdAt: Date.now() });
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoder.encode(payload)
  );

  const stored = {
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    cipher: bufToBase64(cipher)
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  return role;
}

export async function unlockSession(pin) {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const { salt, iv, cipher } = JSON.parse(raw);
    const key = await deriveKey(pin, base64ToBuf(salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(iv) },
      key,
      base64ToBuf(cipher)
    );

    const json = JSON.parse(decoder.decode(plaintext));
    return json.role || null;
  } catch (err) {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function hasStoredSession() {
  return !!localStorage.getItem(SESSION_KEY);
}

export function allowedPins() {
  return Object.keys(PIN_TO_ROLE);
}

export function roleForPin(pin) {
  return PIN_TO_ROLE[pin] || null;
}
