export type UiLanguage = "zh" | "en";

export const DEFAULT_UI_LANGUAGE: UiLanguage = "zh";
export const UI_LANGUAGE_STORAGE_KEY = "jileme.ui-language";

export function normalizeUiLanguage(value: string | null | undefined): UiLanguage | null {
  if (value === "zh" || value === "en") {
    return value;
  }
  return null;
}

export function toDateLocale(language: UiLanguage): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

export function toDocumentLang(language: UiLanguage): string {
  return language === "zh" ? "zh-CN" : "en";
}
