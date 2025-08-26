export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return current USD to KWD rate
  res.status(200).json({
    rate: 0.31,
    timestamp: new Date().toISOString(),
    base: 'USD',
    target: 'KWD'
  });
}
