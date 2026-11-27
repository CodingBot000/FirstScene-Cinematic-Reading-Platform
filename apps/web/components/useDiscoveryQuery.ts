"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  canonicalFilters,
  parseDiscoverySearch,
  selectAvailability,
  selectGenre,
  serializeDiscoverySearch,
  type Availability,
  type DiscoveryFilters,
  type DiscoveryMood,
} from "../lib/discovery-model";

/** Browser query synchronization lives outside the catalog view. */
export function useDiscoveryQuery(initial: DiscoveryFilters) {
  const [filters, setFilters] = useState(() => canonicalFilters(initial));
  const router = useRouter();
  const hydrated = useRef(false);
  const search = useCallback((q: string) => {
    setFilters((old) => canonicalFilters({ ...old, q }));
  }, []);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const debounce = window.setTimeout(() => {
      router.replace("/discover" + serializeDiscoverySearch(filters), {
        scroll: false,
      });
    }, 200);
    return () => window.clearTimeout(debounce);
  }, [filters, router]);

  useEffect(() => {
    const sync = () => setFilters(parseDiscoverySearch(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return {
    filters,
    search,
    mood: (mood: DiscoveryMood) =>
      setFilters((old) => canonicalFilters({ ...old, mood })),
    status: (status: Availability) =>
      setFilters((old) => selectAvailability(old, status)),
    genre: (genre: string) => setFilters((old) => selectGenre(old, genre)),
    reset: () => setFilters(canonicalFilters({})),
  };
}
