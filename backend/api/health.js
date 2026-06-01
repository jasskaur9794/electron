const { getStatus } = require('./lib/key-manager');

/**
 * GET /api/health
 * 
 * Returns key pool status — useful for monitoring.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const status = getStatus();
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      keys: status,
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
};
