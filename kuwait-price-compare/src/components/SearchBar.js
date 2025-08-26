import React, { useState } from 'react';

const SearchBar = ({ onSearch, loading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  const quickSearchItems = ['iPhone 15', 'Samsung TV', 'MacBook', 'PlayStation 5', 'AirPods'];

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit}>
        <div className="search-input-group">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search for products..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
            disabled={loading}
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={loading || !query.trim()}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      <div className="quick-search">
        {quickSearchItems.map((item, index) => (
          <button
            key={index}
            onClick={() => {
              setQuery(item);
              onSearch(item);
            }}
            className="quick-search-item"
            disabled={loading}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SearchBar;
