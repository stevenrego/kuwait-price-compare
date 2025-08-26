import React from 'react';

const TrendingProducts = ({ onSearch }) => {
  const categories = [
    {
      name: 'Electronics',
      icon: '📱',
      items: ['iPhone 15', 'Samsung TV', 'MacBook', 'iPad', 'AirPods']
    },
    {
      name: 'Gaming',
      icon: '🎮', 
      items: ['PlayStation 5', 'Xbox Series X', 'Nintendo Switch']
    },
    {
      name: 'Home & Kitchen',
      icon: '🏠',
      items: ['Dyson Vacuum', 'Air Fryer', 'Coffee Machine']
    }
  ];

  return (
    <div className="trending-container">
      <h2>🔥 Popular Searches in Kuwait</h2>
      <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: '2rem' }}>
        {categories.map((category, index) => (
          <div key={index} style={{ background: 'white', padding: '2rem', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{category.icon}</span>
              {category.name}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {category.items.map((item, itemIndex) => (
                <button
                  key={itemIndex}
                  onClick={() => onSearch(item)}
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrendingProducts;
