"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";

type SearchableSelectOption = {
  key: string;
  label: string;
};

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  className,
}: SearchableSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = useMemo(() => options.find((option) => option.key === value), [options, value]);
  const filteredOptions = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.key}`.toLowerCase();
      return haystack.includes(trimmedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }

      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (filteredOptions.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    setHighlightedIndex((current) => Math.min(current, filteredOptions.length - 1));
  }, [filteredOptions, isOpen]);

  const open = () => {
    setIsOpen(true);
    setQuery("");
    setHighlightedIndex(0);
  };

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  const select = (nextValue: string) => {
    onChange(nextValue);
    close();
  };

  const handleInputFocus = () => {
    if (!isOpen) {
      open();
    }
  };

  const handleInputClick = () => {
    if (!isOpen) {
      open();
    }
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!isOpen) {
      setIsOpen(true);
    }

    setQuery(event.target.value);
    setHighlightedIndex(0);
  };

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        open();
        return;
      }
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(0, filteredOptions.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        open();
        return;
      }
      setHighlightedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const highlightedOption = filteredOptions[highlightedIndex];
      if (highlightedOption) {
        select(highlightedOption.key);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  const displayValue = isOpen ? query : selectedOption?.label ?? "";

  return (
    <div className={`searchable-select ${className ?? ""}`.trim()} ref={rootRef}>
      <div className="searchable-select__input-wrap">
        <input
          ref={inputRef}
          className="input searchable-select__input"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`searchable-select-listbox-${id}`}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && filteredOptions[highlightedIndex] ? `searchable-select-option-${id}-${highlightedIndex}` : undefined}
          placeholder={selectedOption ? undefined : placeholder}
          value={displayValue}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
        />
        {value ? (
          <button
            type="button"
            className="searchable-select__clear"
            aria-label="Clear selected model"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery("");
              setIsOpen(false);
            }}
          >
            x
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <ul className="searchable-select__list" id={`searchable-select-listbox-${id}`} role="listbox">
          {filteredOptions.length === 0 ? (
            <li className="searchable-select__empty">No models found</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li key={option.key} role="option" aria-selected={option.key === value}>
                <button
                  id={`searchable-select-option-${id}-${index}`}
                  type="button"
                  className={`searchable-select__option ${index === highlightedIndex ? "is-highlighted" : ""} ${option.key === value ? "is-selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => select(option.key)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
