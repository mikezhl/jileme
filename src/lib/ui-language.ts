export type UiLanguage = "zh" | "en";

export const DEFAULT_UI_LANGUAGE: UiLanguage = "zh";
export const UI_LANGUAGE_STORAGE_KEY = "jileme.ui-language";
export const SITE_TITLE_BY_LANGUAGE: Record<UiLanguage, string> = {
  zh: "急了么",
  en: "Logicly Chat",
};

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

export function toSiteTitle(language: UiLanguage): string {
  return SITE_TITLE_BY_LANGUAGE[language];
}
