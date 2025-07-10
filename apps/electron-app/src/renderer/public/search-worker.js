/* eslint-env worker */
/* global self */
// Search worker for omnibox suggestions
self.onmessage = event => {
  const { allSuggestions, query, type } = event.data;

  if (!query && type !== "initial") {
    self.postMessage([]);
    return;
  }

  const lowerCaseQuery = query ? query.toLowerCase() : "";

  // For initial load (empty query), return top sites
  if (type === "initial" || !query) {
    // Sort by visit count and recency for top sites - optimized calculation
    const now = Date.now();
    const sortedSites = allSuggestions
      .filter(s => s.type === "history")
      .sort((a, b) => {
        // Simplified scoring for better performance
        const aScore =
          (a.visitCount || 1) *
          (1 / (1 + (now - a.lastVisit) / (1000 * 60 * 60 * 24)));
        const bScore =
          (b.visitCount || 1) *
          (1 / (1 + (now - b.lastVisit) / (1000 * 60 * 60 * 24)));
        return bScore - aScore;
      })
      .slice(0, 6);

    self.postMessage(sortedSites);
    return;
  }

  // Perform filtering with optimized scoring
  const filtered = allSuggestions
    .map(suggestion => {
      let _score = 0;
      const textLower = (suggestion.text || "").toLowerCase();
      const urlLower = (suggestion.url || "").toLowerCase();

      // Optimized scoring - focus on most important matches
      if (textLower === lowerCaseQuery) _score += 100;
      else if (textLower.startsWith(lowerCaseQuery)) _score += 50;
      else if (textLower.includes(lowerCaseQuery)) _score += 20;

      if (urlLower === lowerCaseQuery) _score += 90;
      else if (urlLower.startsWith(lowerCaseQuery)) _score += 40;
      else if (urlLower.includes(lowerCaseQuery)) _score += 15;

      // Boost by type and visit count
      if (suggestion.type === "history") _score += 5;
      if (suggestion.type === "bookmark") _score += 8;
      if (suggestion.visitCount) {
        _score += Math.min(suggestion.visitCount, 10);
      }

      return { ...suggestion, _score };
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8); // Reduced from 10 to 8 for better performance

  // Remove the score before sending back
  const results = filtered.map(({ _score, ...suggestion }) => suggestion);

  self.postMessage(results);
};
