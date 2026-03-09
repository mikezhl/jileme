"use client";

import { useEffect } from "react";

import { useUiLanguage } from "@/lib/use-ui-language";
import { toSiteTitle } from "@/lib/ui-language";

export default function DocumentTitleSync() {
  const { language } = useUiLanguage();

  useEffect(() => {
    document.title = toSiteTitle(language);
  }, [language]);

  return null;
}
