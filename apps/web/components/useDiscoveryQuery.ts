"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
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

const urlChanged = "firstscene:discovery-url";
const currentSearch = () =>
  new URLSearchParams(window.location.search).toString();

function subscribeSearch(notify: () => void) {
  window.addEventListener(urlChanged, notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener(urlChanged, notify);
    window.removeEventListener("popstate", notify);
  };
}

export function useDiscoveryQuery(initial: DiscoveryFilters) {
  const params = useSearchParams();
  const serverSearch =
    params?.toString() ?? serializeDiscoverySearch(initial).slice(1);
  const searchParams = useSyncExternalStore(
    subscribeSearch,
    currentSearch,
    () => serverSearch,
  );
  const filters = parseDiscoverySearch(searchParams);
  const [draft, setDraft] = useState<{ search: string; value: string } | null>(
    null,
  );
  const timer = useRef<number | undefined>(undefined);
  const composing = useRef(false);

  useEffect(() => {
    const cancel = () => {
      window.clearTimeout(timer.current);
      composing.current = false;
      setDraft(null);
    };
    const onClick = (event: MouseEvent) => {
      if (
        !event.defaultPrevented &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.target instanceof Element &&
        event.target.closest("a[data-reset-discovery]")
      )
        cancel();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", cancel);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", cancel);
    };
  }, []);

  const commit = (next: DiscoveryFilters) => {
    window.clearTimeout(timer.current);
    const href = "/discover" + serializeDiscoverySearch(next);
    if (window.location.pathname + window.location.search !== href) {
      window.history.replaceState(null, "", href);
      window.dispatchEvent(new Event(urlChanged));
    }
    setDraft(null);
  };
  const query = draft?.search === searchParams ? draft.value : filters.q;

  function edit(value: string) {
    window.clearTimeout(timer.current);
    const search = currentSearch();
    const pathname = window.location.pathname;
    setDraft({ search, value });
    if (composing.current) return;
    timer.current = window.setTimeout(() => {
      if (window.location.pathname !== pathname || currentSearch() !== search)
        return;
      commit({ ...parseDiscoverySearch(search), q: value });
    }, 200);
  }
  function update(change: (current: DiscoveryFilters) => DiscoveryFilters) {
    const search = currentSearch();
    const current = parseDiscoverySearch(search);
    const q =
      !composing.current && draft?.search === search ? draft.value : current.q;
    commit(change({ ...current, q }));
  }

  return {
    filters,
    query,
    search: edit,
    compositionStart: () => {
      composing.current = true;
      window.clearTimeout(timer.current);
    },
    compositionEnd: (value: string) => {
      composing.current = false;
      edit(value);
    },
    submit: () => {
      if (!composing.current) update((current) => current);
    },
    mood: (mood: DiscoveryMood) => update((current) => ({ ...current, mood })),
    status: (status: Availability) =>
      update((current) => selectAvailability(current, status)),
    genre: (genre: string) => update((current) => selectGenre(current, genre)),
    reset: () => commit(canonicalFilters({})),
  };
}
