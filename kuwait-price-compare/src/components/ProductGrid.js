import React from 'react';
import ProductCard from './ProductCard';

const ProductGrid = ({ products }) => {
  const sortedProducts = [...products].sort((a, b) => a.price - b.price);

  return (
    <div className="product-grid-container">
      <h2>📦 Found {products.length} products</h2>
      <div className="product-grid">
        {sortedProducts.map((product, index) => (
          <ProductCard 
            key={`${product.seller}-${index}`} 
            product={product}
            rank={index + 1}
          />
        ))}
      </div>
    </div>
  );
};

export default ProductGrid;
