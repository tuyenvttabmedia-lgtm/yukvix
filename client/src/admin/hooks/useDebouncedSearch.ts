import { useEffect, useState } from "react";

export function useDebouncedSearch(initial = "", delayMs = 300) {
  const [search, setSearch] = useState(initial);
  const [debouncedSearch, setDebouncedSearch] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), delayMs);
    return () => clearTimeout(t);
  }, [search, delayMs]);

  return { search, debouncedSearch, setSearch };
}
