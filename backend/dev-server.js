/**
 * Local development server — simulates Vercel serverless functions locally.
 * Run with: npm run dev
 */
const http = require('http');
require('dotenv').config();

const solveHandler = require('./api/solve');
const healthHandler = require('./api/health');

const PORT = process.env.PORT || 3456;

const server = http.createServer(async (req, res) => {
  // Add Vercel-compatible helpers to raw http.ServerResponse
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  const originalJson = res.json;
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };

  // Parse JSON body for POST requests
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    try {
      req.body = JSON.parse(body);
    } catch {
      req.body = {};
    }
  }

  // Simple router
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/solve') {
    return solveHandler(req, res);
  }

  if (url.pathname === '/api/health') {
    return healthHandler(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n  🚀 Finder Backend running at http://localhost:${PORT}`);
  console.log(`  📡 POST /api/solve   — send screenshot for AI processing`);
  console.log(`  💚 GET  /api/health  — check key pool status\n`);
});
