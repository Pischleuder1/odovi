"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  searchAddress,
  type AddressSearchResponse,
  type AddressSearchResult,
} from "../../../lib/actions/places";

const MIN_QUERY_LENGTH = 3;

export interface AddressSearchProps {
  onSelect: (result: AddressSearchResult) => void;
}

/** Editing the input only changes local state; click or Enter submits it. */
export function AddressSearch({ onSelect }: AddressSearchProps) {
  const t = useTranslations("places");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<AddressSearchResponse | null>(null);
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);

  async function submitSearch() {
    const q = query.trim();
    const id = ++requestId.current;
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
    if (q.length < MIN_QUERY_LENGTH) {
      setResponse({ status: "invalid", results: [] });
      return;
    }

    setLoading(true);
    setResponse(null);
    const found = await searchAddress(q);
    if (requestId.current !== id) return;
    setLoading(false);
    setResponse(found);
    if (found.status === "ok") {
      setResults(found.results);
      setOpen(true);
    }
  }

  function handleSelect(result: AddressSearchResult) {
    requestId.current += 1;
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
    setResults([]);
    setResponse(null);
    setLoading(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else {
        void submitSearch();
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function handleQueryChange(value: string) {
    requestId.current += 1;
    setQuery(value);
    setResults([]);
    setOpen(false);
    setResponse(null);
    setLoading(false);
    setActiveIndex(-1);
  }

  const statusMessage =
    response?.status === "invalid"
      ? t("addressSearch.invalid")
      : response?.status === "disabled"
        ? t("addressSearch.disabled")
        : response?.status === "rate-limited"
          ? t("addressSearch.rateLimited")
          : response?.status === "empty"
            ? t("addressSearch.empty")
            : response?.status === "upstream-failure"
              ? t("addressSearch.upstreamFailure")
              : response?.status === "ok" && response.source === "cache"
                ? t("addressSearch.cached")
                : null;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t("addressSearch.placeholder")}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="address-search-results"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100"
        />
        <button
          type="button"
          disabled={loading}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void submitSearch()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <Search aria-hidden size={16} />
          <span className="hidden sm:inline">
            {loading ? t("addressSearch.searching") : t("addressSearch.submit")}
          </span>
          <span className="sr-only sm:hidden">
            {loading ? t("addressSearch.searching") : t("addressSearch.submit")}
          </span>
        </button>
      </div>

      <div aria-live="polite" className="mt-1 min-h-5 text-xs text-neutral-500 dark:text-neutral-400">
        {loading ? t("addressSearch.searching") : statusMessage}
        {response?.status === "disabled" && (
          <>{" "}<Link className="underline" href="/settings#provider-review">{t("addressSearch.activate")}</Link></>
        )}
        {response && "attribution" in response && (
          <>{" · "}<a className="underline" href={response.attribution.url} target="_blank" rel="noreferrer">{response.attribution.label}</a></>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="address-search-results"
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {results.map((result, index) => (
            <li key={`${result.lat},${result.lon}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(result)}
                className={`block w-full px-3 py-2 text-left ${
                  index === activeIndex
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                }`}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
