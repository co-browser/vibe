import { useEffect, useState, useRef, useCallback } from "react";

interface SearchWorkerResult {
  results: any[];
  search: (query: string) => void;
  updateSuggestions: (suggestions: any[]) => void;
  updateResults: (results: any[]) => void;
  loading: boolean;
}

export function useSearchWorker(
  initialSuggestions: any[] = [],
): SearchWorkerResult {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const allSuggestionsRef = useRef(initialSuggestions);
  const searchIdRef = useRef(0);

  useEffect(() => {
    // Create the worker
    workerRef.current = new Worker("/search-worker.js");

    // Listen for results from the worker
    workerRef.current.onmessage = event => {
      console.log("🔍 Search worker received results:", event.data);
      setResults(event.data);
      setLoading(false);
    };

    workerRef.current.onerror = error => {
      console.error("Search worker error:", error);
      setLoading(false);
    };

    // Cleanup: terminate the worker when the component unmounts
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const search = useCallback((query: string) => {
    if (!workerRef.current) {
      console.error("❌ Search worker not available");
      return;
    }

    // Increment search ID to ignore stale results
    searchIdRef.current += 1;
    const currentSearchId = searchIdRef.current;

    console.log("🔍 Search worker search called:", {
      query,
      allSuggestionsCount: allSuggestionsRef.current.length,
      currentSearchId,
    });

    setLoading(true);

    // Store the search ID with the message
    workerRef.current.postMessage({
      allSuggestions: allSuggestionsRef.current,
      query,
      searchId: currentSearchId,
      type: query ? "search" : "initial",
    });
  }, []);

  const updateSuggestions = useCallback((suggestions: any[]) => {
    console.log("🔍 Search worker updateSuggestions called:", {
      suggestionsCount: suggestions.length,
      firstSuggestion: suggestions[0],
    });
    allSuggestionsRef.current = suggestions;
  }, []);

  const updateResults = useCallback((newResults: any[]) => {
    console.log("🔍 Search worker updateResults called:", {
      resultsCount: newResults.length,
    });
    setResults(newResults);
  }, []);

  return { results, search, updateSuggestions, updateResults, loading };
}
