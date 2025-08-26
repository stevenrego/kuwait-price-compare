import React from 'react';

const PriceAnalysis = ({ analysis, query }) => {
  if (!analysis) return null;

  return (
    <div className="price-analysis">
      <h2>💰 Price Analysis for "{query}"</h2>
      <div className="analysis-grid">
        <div className="analysis-card">
          <h3>Lowest Price</h3>
          <div className="price-value">{analysis.minPrice?.toFixed(3)} KWD</div>
        </div>
        <div className="analysis-card">
          <h3>Highest Price</h3>
          <div className="price-value">{analysis.maxPrice?.toFixed(3)} KWD</div>
        </div>
        <div className="analysis-card">
          <h3>Average Price</h3>
          <div className="price-value">{analysis.avgPrice?.toFixed(3)} KWD</div>
        </div>
        <div className="analysis-card">
          <h3>You Can Save</h3>
          <div className="price-value">{analysis.savings?.toFixed(3)} KWD</div>
        </div>
      </div>
    </div>
  );
};

export default PriceAnalysis;
