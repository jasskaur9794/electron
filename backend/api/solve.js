const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, blacklistKey } = require('./lib/key-manager');

// ─── System Prompt (same as Electron client) ────────────────────────────────
const SYSTEM_PROMPT = `You are an answer-only bot. You will receive a screenshot of a question. Follow these rules STRICTLY:

- If it's a Multiple Choice Question (MCQ): respond with ONLY the correct option letter and its text. Example: "B) 42". Nothing else.
- If it's asking for code: respond with ONLY the raw code. No explanations, no markdown fences, no comments about the code. Just the pure code.
- If it's a math problem: respond with ONLY the final numerical answer or expression.
- If it's a fill-in-the-blank: respond with ONLY the answer word(s).
- For anything else: respond in maximum 1 short sentence.

NEVER explain your reasoning. NEVER add context. NEVER say "The answer is...". Just give the raw answer. Be as brief as physically possible.`;

const MAX_RETRIES = 3;

/**
 * POST /api/solve
 * 
 * Body: { image: "<base64 png data>", secret?: "<auth secret>" }
 * Response: { answer: "...", keyUsed: 2, totalKeys: 10 }
 */
module.exports = async function handler(req, res) {
  // ─── CORS ───────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── Auth check (optional but recommended) ─────────────────────────────
  const expectedSecret = process.env.API_SECRET;
  if (expectedSecret && expectedSecret !== 'your_secret_here') {
    const provided =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.body?.secret;
    if (provided !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // ─── Validate body ─────────────────────────────────────────────────────
  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'Missing "image" field (base64 string)' });
  }

  // Strip data URI prefix if present
  const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, '');

  // ─── Call Gemini with retry + key rotation ─────────────────────────────
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { key, index, totalKeys } = getNextKey();

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

      const imagePart = {
        inlineData: {
          data: cleanBase64,
          mimeType: 'image/png',
        },
      };

      const result = await model.generateContent([SYSTEM_PROMPT, imagePart]);
      const response = await result.response;
      const answer = response.text().trim();

      return res.status(200).json({
        answer,
        keyUsed: index + 1,
        totalKeys,
      });
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.httpStatusCode || err?.code;
      const msg = (err?.message || '').toLowerCase();

      // If rate-limited (429) or resource exhausted, blacklist this key and retry
      if (
        status === 429 ||
        msg.includes('resource exhausted') ||
        msg.includes('rate limit') ||
        msg.includes('quota')
      ) {
        blacklistKey(key);
        console.warn(
          `[Key ${index + 1}/${totalKeys}] Rate limited, blacklisted for 60s. Retrying with next key...`
        );
        continue;
      }

      // If it's a known non-retryable error (like auth or bad request), we can stop
      if (status === 400 || status === 401 || status === 403) {
        break;
      }

      // For other errors (networking, internal server errors, etc.), try next key
      continue;
    }
  }

  // All retries exhausted
  console.error('[solve] All retries failed:', lastError?.message);
  return res.status(500).json({
    error: 'All API keys exhausted or error occurred',
    details: lastError?.message || 'Unknown error',
  });
};
