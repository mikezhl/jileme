"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_UI_LANGUAGE,
  normalizeUiLanguage,
  toDocumentLang,
  UI_LANGUAGE_STORAGE_KEY,
  type UiLanguage,
} from "./ui-language";

type Listener = () => void;

const listeners = new Set<Listener>();

function readLanguageFromStorage(): UiLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_UI_LANGUAGE;
  }

  return (
    normalizeUiLanguage(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)) ??
    DEFAULT_UI_LANGUAGE
  );
}

function getServerSnapshot(): UiLanguage {
  return DEFAULT_UI_LANGUAGE;
}

function getClientSnapshot(): UiLanguage {
  return readLanguageFromStorage();
}

function subscribe(listener: Listener) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === UI_LANGUAGE_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function emitLanguageChange() {
  for (const listener of listeners) {
    listener();
  }
}

function writeLanguage(nextLanguage: UiLanguage) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
  document.documentElement.lang = toDocumentLang(nextLanguage);
  emitLanguageChange();
}

export function useUiLanguage() {
  const language = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    writeLanguage(nextLanguage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    document.documentElement.lang = toDocumentLang(language);
  }, [language]);

  return { language, setLanguage };
}
