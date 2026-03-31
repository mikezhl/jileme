import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type UiLanguage } from "@/lib/ui-language";

import {
  MANUAL_INPUT_PROPS,
  MANUAL_SECRET_INPUT_PROPS,
  configuredLabel,
  type DashboardTranslate,
  type LlmFormState,
  type LlmKeyStatus,
} from "../dashboard-page-support";
import { SettingsInputField } from "./settings-input-field";

type LlmSettingsPanelProps = {
  isAuthenticated: boolean;
  language: UiLanguage;
  llmError: string;
  llmForm: LlmFormState;
  llmKeyStatus: LlmKeyStatus | null;
  llmLoading: boolean;
  onClearLlm: () => Promise<void>;
  onRefreshLlmStatus: () => Promise<void>;
  onSaveLlm: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setLlmForm: Dispatch<SetStateAction<LlmFormState>>;
  t: DashboardTranslate;
};

export function LlmSettingsPanel({
  isAuthenticated,
  language,
  llmError,
  llmForm,
  llmKeyStatus,
  llmLoading,
  onClearLlm,
  onRefreshLlmStatus,
  onSaveLlm,
  setLlmForm,
  t,
}: LlmSettingsPanelProps) {
  const isConfigured = Boolean(llmKeyStatus?.configured);

  return (
    <details className="minimal-details settings-panel">
      <summary>
        <span className="settings-summary-title">{t("配置分析 LLM", "Configure Analysis LLM")}</span>
        <span className={`settings-status-pill ${isConfigured ? "configured" : "unconfigured"}`}>
          {configuredLabel(isConfigured, language)}
        </span>
      </summary>

      {!isAuthenticated ? (
        <div className="details-content">
          <p className="panel-tip">
            {t("登录后可单独保存你自己的分析 LLM 配置。", "Sign in to store your own analysis LLM settings separately.")}
          </p>
        </div>
      ) : (
        <div className="details-content">
          <p className="panel-tip">
            {t(
              "这一组配置与 LiveKit/转录配置分开保存，仅在 `CONVERSATION_LLM_PROVIDER=openai-compatible` 时用于房间分析。已保存的值会直接显示在输入框中；如需修改，请完整替换这一组字段。",
              "This set is stored separately from LiveKit/transcription settings and is used for room analysis only when `CONVERSATION_LLM_PROVIDER=openai-compatible`. Saved values appear directly in the inputs; replace the full set to update them.",
            )}
          </p>

          <form className="key-form" onSubmit={(event) => void onSaveLlm(event)} autoComplete="off">
            <SettingsInputField
              {...MANUAL_INPUT_PROPS}
              label="LLM URL"
              maskedValue={llmKeyStatus?.baseUrlMask}
              type="url"
              inputMode="url"
              name="conversation-llm-base-url"
              value={llmForm.baseUrl}
              onChange={(event) => setLlmForm((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder={t(
                "CONVERSATION_LLM_OPENAI_BASE_URL（必填）",
                "CONVERSATION_LLM_OPENAI_BASE_URL (required)",
              )}
            />
            <SettingsInputField
              {...MANUAL_SECRET_INPUT_PROPS}
              label="LLM API Key"
              maskedValue={llmKeyStatus?.apiKeyMask}
              type="password"
              name="conversation-llm-api-key"
              value={llmForm.apiKey}
              onChange={(event) => setLlmForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="CONVERSATION_LLM_OPENAI_API_KEY"
            />
            <SettingsInputField
              {...MANUAL_INPUT_PROPS}
              label="LLM Model"
              maskedValue={llmKeyStatus?.model}
              name="conversation-llm-model"
              value={llmForm.model}
              onChange={(event) => setLlmForm((current) => ({ ...current, model: event.target.value }))}
              placeholder="CONVERSATION_LLM_OPENAI_MODEL"
            />

            <div className="key-form-actions">
              <button type="submit" className="primary-btn" disabled={llmLoading}>
                {llmLoading ? t("保存中...", "Saving...") : t("保存", "Save")}
              </button>
              <button type="button" className="ghost-btn" disabled={llmLoading} onClick={() => void onClearLlm()}>
                {t("清空", "Clear")}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={llmLoading}
                onClick={() => void onRefreshLlmStatus()}
              >
                {t("刷新", "Refresh")}
              </button>
            </div>
          </form>

          {llmError ? <p className="form-error">{llmError}</p> : null}
        </div>
      )}
    </details>
  );
}
