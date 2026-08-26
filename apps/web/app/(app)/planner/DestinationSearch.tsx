"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  searchAddress,
  type AddressSearchResponse,
  type AddressSearchResult,
} from "../../../lib/actions/places";

const MIN_QUERY_LENGTH = 3;

export interface DestinationSearchProps {
  onSelect: (result: AddressSearchResult) => void;
  value: string;
  selected?: boolean;
  onValueChange: (value: string) => void;
}

/** Editing the destination stays local; click or Enter explicitly searches. */
export function DestinationSearch({
  onSelect,
  value,
  selected = false,
  onValueChange,
}: DestinationSearchProps) {
  const t = useTranslations("planner");
  const [response, setResponse] = useState<AddressSearchResponse | null>(null);
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestId = useRef(0);

  function resetSearchState() {
    requestId.current += 1;
    setResults([]);
    setOpen(false);
    setLoading(false);
    setResponse(null);
    setActiveIndex(-1);
  }

  async function submitSearch() {
    const query = value.trim();
    const id = ++requestId.current;
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    if (query.length < MIN_QUERY_LENGTH) {
      setResponse({ status: "invalid", results: [] });
      return;
    }

    setLoading(true);
    setResponse(null);
    const found = await searchAddress(query);
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
    onValueChange(result.label);
    onSelect(result);
    setOpen(false);
    setResults([]);
    setLoading(false);
    setResponse(null);
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

  function handleClear() {
    resetSearchState();
    onValueChange("");
  }

  const statusMessage =
    response?.status === "invalid"
      ? t("destinationSearch.invalid")
      : response?.status === "disabled"
        ? t("destinationSearch.disabled")
        : response?.status === "rate-limited"
          ? t("destinationSearch.rateLimited")
          : response?.status === "empty"
            ? t("destinationSearch.empty")
            : response?.status === "upstream-failure"
              ? t("destinationSearch.upstreamFailure")
              : response?.status === "ok" && response.source === "cache"
                ? t("destinationSearch.cached")
                : null;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={value}
            onChange={(event) => {
              resetSearchState();
              onValueChange(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => !selected && results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t("destinationSearch.placeholder")}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="planner-destination-results"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 pr-10 text-base text-neutral-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-cyan-300/50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-violet-400"
          />
          {value && !loading && (
            <button
              type="button"
              aria-label={t("destinationSearch.clear")}
              title={t("destinationSearch.clear")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 dark:focus-visible:ring-white"
            >
              <X aria-hidden size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={loading || selected}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void submitSearch()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <Search aria-hidden size={16} />
          <span className="hidden sm:inline">
            {loading ? t("destinationSearch.searching") : t("destinationSearch.submit")}
          </span>
          <span className="sr-only sm:hidden">
            {loading ? t("destinationSearch.searching") : t("destinationSearch.submit")}
          </span>
        </button>
      </div>

      <div aria-live="polite" className="mt-1 min-h-5 text-xs text-neutral-500 dark:text-neutral-400">
        {loading ? t("destinationSearch.searching") : statusMessage}
        {response?.status === "disabled" && (
          <>{" "}<Link className="underline" href="/settings#provider-review">{t("destinationSearch.activate")}</Link></>
        )}
        {response && "attribution" in response && (
          <>{" · "}<a className="underline" href={response.attribution.url} target="_blank" rel="noreferrer">{response.attribution.label}</a></>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="planner-destination-results"
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
