// Mock data generator for demo
const generateMockData = (query) => {
  const mockProducts = [
    {
      title: `${query} - Premium Model`,
      price: Math.random() * 500 + 100,
      image: 'https://via.placeholder.com/300x200?text=Product+Image',
      link: `https://www.xcite.com/search?q=${encodeURIComponent(query)}`,
      seller: 'X-cite',
      logo: 'https://via.placeholder.com/50x30?text=Xcite'
    },
    {
      title: `${query} - Standard Edition`,
      price: Math.random() * 400 + 80,
      image: 'https://via.placeholder.com/300x200?text=Product+Image',
      link: `https://www.bestalkuwait.com/search?q=${encodeURIComponent(query)}`,
      seller: 'Best Al Kuwait',
      logo: 'https://via.placeholder.com/50x30?text=BAK'
    },
    {
      title: `${query} - Budget Option`,
      price: Math.random() * 300 + 50,
      image: 'https://via.placeholder.com/300x200?text=Product+Image',
      link: `https://amazon.com/s?k=${encodeURIComponent(query)}`,
      seller: 'Amazon',
      logo: 'https://via.placeholder.com/50x30?text=Amazon'
    },
    {
      title: `${query} - Great Deal`,
      price: Math.random() * 200 + 30,
      image: 'https://via.placeholder.com/300x200?text=Product+Image', 
      link: `https://temu.com/search_result.html?search_key=${encodeURIComponent(query)}`,
      seller: 'Temu',
      logo: 'https://via.placeholder.com/50x30?text=Temu'
    }
  ];

  return mockProducts.map((product, index) => ({
    ...product,
    id: `mock-${index}`,
    currency: 'KWD',
    availability: 'In Stock'
  }));
};

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { q: query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const products = generateMockData(query);
    
    // Sort by price
    products.sort((a, b) => a.price - b.price);

    // Calculate analysis
    const prices = products.map(p => p.price);
    const analysis = {
      count: products.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      savings: Math.max(...prices) - Math.min(...prices),
      currency: 'KWD'
    };

    res.status(200).json({
      query,
      products,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
