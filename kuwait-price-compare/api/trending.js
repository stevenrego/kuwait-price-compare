export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const trending = [
    'iPhone 15 Pro', 'Samsung Galaxy S24', 'MacBook Air M3',
    'PlayStation 5', 'AirPods Pro', 'iPad Air',
    'Nintendo Switch OLED', 'LG OLED TV', 'Dyson V15'
  ];

  res.status(200).json({ trending });
}
