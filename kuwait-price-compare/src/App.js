import React, { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import ProductGrid from './components/ProductGrid';
import PriceAnalysis from './components/PriceAnalysis';
import TrendingProducts from './components/TrendingProducts';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';

function App() {
  const [products, setProducts] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const searchProducts = async (query) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error('Failed to search products');
    }
    return await response.json();
  };

  const handleSearch = useCallback(async (query) => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError('');
    setSearchQuery(query);

    try {
      const data = await searchProducts(query);
      setProducts(data.products);
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err.message || 'Failed to search products');
      setProducts([]);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="App">
      <header className="app-header">
        <div className="container">
          <div className="header-content">
            <h1>🔍 Kuwait Price Compare</h1>
            <p>Find the best deals across Kuwait's top retailers & international sites</p>
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="container">
          {error && (
            <div className="error-message">
              <span>❌ {error}</span>
            </div>
          )}

          {loading && <LoadingSpinner />}

          {!loading && !searchQuery && !error && (
            <TrendingProducts onSearch={handleSearch} />
          )}

          {!loading && searchQuery && products.length === 0 && !error && (
            <div className="no-results">
              <h2>🔍 No products found for "{searchQuery}"</h2>
              <p>Try different keywords or check the spelling</p>
            </div>
          )}

          {!loading && products.length > 0 && (
            <>
              <PriceAnalysis analysis={analysis} query={searchQuery} />
              <ProductGrid products={products} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
