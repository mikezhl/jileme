"use client";

import { useUiLanguage } from "@/lib/use-ui-language";

import { type DashboardPageClientProps } from "./dashboard-page-support";
import { DashboardPageView } from "./dashboard-page-view";
import { useDashboardState } from "./use-dashboard-state";

export default function DashboardPageClient(props: DashboardPageClientProps) {
  const { language, setLanguage } = useUiLanguage();
  const isZh = language === "zh";
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const state = useDashboardState({ ...props, language, t });
  const showUserProviderSettings = props.initialUserProviderKeysMode !== "false";

  return (
    <DashboardPageView
      homePageFooterText={props.homePageFooterText}
      isZh={isZh}
      language={language}
      onToggleLanguage={() => setLanguage(isZh ? "en" : "zh")}
      showUserProviderSettings={showUserProviderSettings}
      state={state}
      t={t}
    />
  );
}
