import React from 'react';

const ProductCard = ({ product, rank }) => {
  const handleBuyNow = () => {
    if (product.link && product.link !== '#') {
      window.open(product.link, '_blank');
    }
  };

  return (
    <div className="product-card">
      {rank <= 3 && (
        <div className="rank-badge">#{rank}</div>
      )}

      <img 
        src={product.image} 
        alt={product.title}
        className="product-image"
        onError={(e) => {
          e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
        }}
      />

      <div className="product-info">
        <h3 className="product-title">{product.title}</h3>

        <div className="seller-info">
          <img 
            src={product.logo} 
            alt={product.seller}
            className="seller-logo"
            onError={(e) => e.target.style.display = 'none'}
          />
          <span className="seller-name">{product.seller}</span>
        </div>

        <div className="current-price">
          {product.price.toFixed(3)} KWD
        </div>

        <button 
          onClick={handleBuyNow}
          className="buy-button"
          disabled={!product.link || product.link === '#'}
        >
          🛒 View at {product.seller}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
