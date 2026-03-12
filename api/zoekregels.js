/**
 * Vercel Serverless Function: /api/zoekregels
 *
 * Proxies the Google Apps Script endpoint so the browser never makes a
 * cross-origin request directly — Google doesn't send CORS headers, so any
 * direct fetch from the frontend gets blocked by the browser.
 *
 * The function runs on Vercel's edge, fetches from Google server-to-server
 * (no CORS restriction), and returns the result with proper CORS headers.
 */

const GOOGLE_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbyPWxnS_RspYHCbozL9WG3h6zWI69bDCBDxH1vJSxllLHYPyl8thuZX8qAMoV0czuig/exec';

export default async function handler(req, res) {
  // Allow the Vercel frontend to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // cache 5 min

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(GOOGLE_WEBAPP_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(502).json({ success: false, error: `Upstream ${upstream.status}` });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    // Return empty rules — app has built-in defaults
    return res.status(200).json({ success: false, zoekregels: [], error: err.message });
  }
}
