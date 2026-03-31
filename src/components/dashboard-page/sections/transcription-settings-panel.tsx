import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type UiLanguage } from "@/lib/ui-language";

import {
  DASHSCOPE_DEFAULT_MODEL,
  MANUAL_SECRET_INPUT_PROPS,
  PROVIDERS,
  configuredLabel,
  providerLabel,
  type DashboardTranslate,
  type TranscriptionFormState,
  type TranscriptionProviderName,
  type TranscriptionSettingsStatus,
} from "../dashboard-page-support";
import { SettingsInputField } from "./settings-input-field";

type TranscriptionSettingsPanelProps = {
  isAuthenticated: boolean;
  language: UiLanguage;
  onClearTranscription: (provider: TranscriptionProviderName) => Promise<void>;
  onSaveTranscription: (
    event: FormEvent<HTMLFormElement>,
    provider: TranscriptionProviderName,
  ) => Promise<void>;
  onSetDefaultProvider: (provider: TranscriptionProviderName | null) => Promise<void>;
  setTranscriptionForm: Dispatch<SetStateAction<TranscriptionFormState>>;
  t: DashboardTranslate;
  transcriptionError: string;
  transcriptionForm: TranscriptionFormState;
  transcriptionLoading: string | null;
  transcriptionStatus: TranscriptionSettingsStatus | null;
};

export function TranscriptionSettingsPanel({
  isAuthenticated,
  language,
  onClearTranscription,
  onSaveTranscription,
  onSetDefaultProvider,
  setTranscriptionForm,
  t,
  transcriptionError,
  transcriptionForm,
  transcriptionLoading,
  transcriptionStatus,
}: TranscriptionSettingsPanelProps) {
  const providerMap = new Map(
    (transcriptionStatus?.providers ?? []).map((item) => [item.provider, item]),
  );
  const configuredProviders = PROVIDERS.filter((provider) => providerMap.get(provider)?.configured).length;

  return (
    <details className="minimal-details settings-panel">
      <summary>
        <span className="settings-summary-title">
          {t("配置实时转录", "Configure Realtime Transcription")}
        </span>
        <span className={`settings-status-pill ${configuredProviders > 0 ? "configured" : "unconfigured"}`}>
          {configuredProviders > 0
            ? t(`已配置 ${configuredProviders}/${PROVIDERS.length}`, `${configuredProviders}/${PROVIDERS.length} configured`)
            : configuredLabel(false, language)}
        </span>
      </summary>

      {!isAuthenticated ? (
        <div className="details-content">
          <p className="panel-tip">
            {t(
              "登录后可分别保存不同转录平台的 Key，并设置自己的默认实时转录工具。",
              "Sign in to store different transcription provider keys separately and choose your default realtime transcription tool.",
            )}
          </p>
        </div>
      ) : (
        <div className="details-content">
          <p className="panel-tip">
            {t(
              "已保存的 API Key 会以掩码形式直接显示在输入框中。房主在用户 Key 模式（true / full）下，必须同时拥有完整的 LiveKit 配置和默认转录工具配置，否则开启语音实时转录时会直接报错。",
              "Saved API keys appear masked directly in the inputs. When user-key mode is enabled (true / full), the room owner must have both a complete LiveKit setup and a configured default transcription provider, otherwise live voice transcription fails immediately.",
            )}
          </p>

          {PROVIDERS.map((provider) => {
            const providerStatus = providerMap.get(provider);
            const isDefault = transcriptionStatus?.defaultProvider === provider;
            const isConfigured = Boolean(providerStatus?.configured);

            return (
              <section key={provider} className="settings-provider-block">
                <div className="settings-provider-head">
                  <div className="settings-provider-title-row">
                    <h4>{providerLabel(provider, language)}</h4>
                    <div className="settings-provider-meta">
                      <span className={`settings-status-pill ${isConfigured ? "configured" : "unconfigured"}`}>
                        {configuredLabel(isConfigured, language)}
                      </span>
                      {isDefault ? <span className="settings-status-pill accent">{t("默认工具", "Default")}</span> : null}
                    </div>
                  </div>
                  {provider === "dashscope" ? (
                    <p className="panel-tip settings-provider-tip">
                      {t("默认模型", "Default model")}: {DASHSCOPE_DEFAULT_MODEL}
                    </p>
                  ) : null}
                </div>

                <form
                  className="key-form"
                  onSubmit={(event) => void onSaveTranscription(event, provider)}
                  autoComplete="off"
                >
                  <SettingsInputField
                    {...MANUAL_SECRET_INPUT_PROPS}
                    label={`${providerLabel(provider, language)} API Key`}
                    maskedValue={providerStatus?.credentialMask}
                    type="password"
                    name={`${provider}-api-key`}
                    value={transcriptionForm[provider]}
                    onChange={(event) =>
                      setTranscriptionForm((current) => ({ ...current, [provider]: event.target.value }))
                    }
                    placeholder={provider === "dashscope" ? "DASHSCOPE_API_KEY" : "DEEPGRAM_API_KEY"}
                  />

                  {provider === "dashscope" ? (
                    <p className="panel-tip" style={{ marginTop: 0 }}>
                      {t(
                        "请输入百炼 API Key，通常以 sk- 开头。",
                        "Use a DashScope API key, which usually starts with sk-.",
                      )}
                    </p>
                  ) : null}

                  <div className="key-form-actions">
                    <button type="submit" className="primary-btn" disabled={transcriptionLoading !== null}>
                      {transcriptionLoading === `save:${provider}`
                        ? t("保存中...", "Saving...")
                        : t("保存", "Save")}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={transcriptionLoading !== null}
                      onClick={() => void onClearTranscription(provider)}
                    >
                      {transcriptionLoading === `clear:${provider}`
                        ? t("清空中...", "Clearing...")
                        : t("清空", "Clear")}
                    </button>
                    <button
                      type="button"
                      className={isDefault ? "primary-btn" : "ghost-btn"}
                      disabled={transcriptionLoading !== null || !providerStatus?.configured}
                      onClick={() => void onSetDefaultProvider(provider)}
                    >
                      {transcriptionLoading === `default:${provider}`
                        ? t("保存中...", "Saving...")
                        : isDefault
                          ? t("默认工具", "Default")
                          : t("设为默认", "Set default")}
                    </button>
                  </div>
                </form>
              </section>
            );
          })}

          {transcriptionError ? <p className="form-error">{transcriptionError}</p> : null}
        </div>
      )}
    </details>
  );
}
