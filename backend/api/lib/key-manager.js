/**
 * Key Manager — Round-robin rotation across multiple Gemini API keys
 * 
 * Uses an atomic counter that increments on every request, distributing
 * load evenly across all configured keys. If a key hits a rate limit (429),
 * it's temporarily blacklisted for 60 seconds before being retried.
 */

// ─── State (persists across warm invocations on Vercel) ─────────────────────
let keyIndex = 0;
const blacklist = new Map(); // key -> unblock timestamp

const BLACKLIST_DURATION_MS = 60_000; // 60 seconds

/**
 * Parse comma-separated keys from env var
 */
function getKeys() {
  const raw = process.env.GEMINI_API_KEYS || '';
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEYS env var is missing or empty');
  }
  return keys;
}

/**
 * Pick the next available key using round-robin with blacklist awareness.
 * Tries every key once before giving up.
 */
function getNextKey() {
  const keys = getKeys();
  const total = keys.length;
  const now = Date.now();

  // Clean expired blacklist entries
  for (const [key, unblockAt] of blacklist.entries()) {
    if (now >= unblockAt) blacklist.delete(key);
  }

  // Try up to `total` keys starting from current index
  for (let attempt = 0; attempt < total; attempt++) {
    const idx = keyIndex % total;
    keyIndex++; // always advance to keep round-robin fair
    const key = keys[idx];

    if (!blacklist.has(key)) {
      return { key, index: idx, totalKeys: total };
    }
  }

  // All keys are blacklisted — return the one that unblocks soonest
  let soonest = null;
  let soonestTime = Infinity;
  for (const [key, unblockAt] of blacklist.entries()) {
    if (unblockAt < soonestTime) {
      soonestTime = unblockAt;
      soonest = key;
    }
  }

  if (soonest) {
    blacklist.delete(soonest);
    return { key: soonest, index: -1, totalKeys: total };
  }

  throw new Error('No API keys available');
}

/**
 * Mark a key as rate-limited (temporarily blacklist it)
 */
function blacklistKey(apiKey) {
  blacklist.set(apiKey, Date.now() + BLACKLIST_DURATION_MS);
}

/**
 * Get status info for health checks
 */
function getStatus() {
  const keys = getKeys();
  const now = Date.now();
  return {
    totalKeys: keys.length,
    blacklistedKeys: [...blacklist.entries()]
      .filter(([, t]) => now < t)
      .map(([k, t]) => ({
        keyPrefix: k.substring(0, 8) + '...',
        unblocksIn: Math.ceil((t - now) / 1000) + 's',
      })),
    currentIndex: keyIndex % keys.length,
  };
}

module.exports = { getNextKey, blacklistKey, getStatus };
