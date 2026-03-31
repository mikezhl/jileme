import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type UiLanguage } from "@/lib/ui-language";

import {
  MANUAL_INPUT_PROPS,
  MANUAL_SECRET_INPUT_PROPS,
  configuredLabel,
  type DashboardTranslate,
  type LivekitFormState,
  type LivekitStatus,
} from "../dashboard-page-support";
import { SettingsInputField } from "./settings-input-field";

type LivekitSettingsPanelProps = {
  isAuthenticated: boolean;
  language: UiLanguage;
  livekitError: string;
  livekitForm: LivekitFormState;
  livekitLoading: boolean;
  livekitStatus: LivekitStatus | null;
  onClearLivekit: () => Promise<void>;
  onRefreshLivekitStatus: () => Promise<void>;
  onSaveLivekit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setLivekitForm: Dispatch<SetStateAction<LivekitFormState>>;
  t: DashboardTranslate;
};

export function LivekitSettingsPanel({
  isAuthenticated,
  language,
  livekitError,
  livekitForm,
  livekitLoading,
  livekitStatus,
  onClearLivekit,
  onRefreshLivekitStatus,
  onSaveLivekit,
  setLivekitForm,
  t,
}: LivekitSettingsPanelProps) {
  const isConfigured = Boolean(livekitStatus?.configured);

  return (
    <details className="minimal-details settings-panel">
      <summary>
        <span className="settings-summary-title">
          {t("配置 LiveKit 通话", "Configure LiveKit Transport")}
        </span>
        <span className={`settings-status-pill ${isConfigured ? "configured" : "unconfigured"}`}>
          {configuredLabel(isConfigured, language)}
        </span>
      </summary>

      {!isAuthenticated ? (
        <div className="details-content">
          <p className="panel-tip">
            {t(
              "登录后可单独保存你自己的 LiveKit 通话配置。",
              "Sign in to store your own LiveKit transport settings separately.",
            )}
          </p>
        </div>
      ) : (
        <div className="details-content">
          <p className="panel-tip">
            {t(
              "这一组配置只负责 LiveKit 通话接入，与实时转录平台分开保存。已保存的值会以掩码形式直接显示在输入框中；如需修改，请完整替换这一组字段。",
              "These credentials only cover LiveKit transport and are stored separately from realtime transcription providers. Saved values appear masked directly in the inputs; replace the full set to update them.",
            )}
          </p>

          <form className="key-form" onSubmit={(event) => void onSaveLivekit(event)} autoComplete="off">
            <SettingsInputField
              {...MANUAL_INPUT_PROPS}
              label="LiveKit URL"
              maskedValue={livekitStatus?.livekitUrlMask}
              type="url"
              inputMode="url"
              name="livekit-url"
              value={livekitForm.livekitUrl}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitUrl: event.target.value }))
              }
              placeholder={t("LIVEKIT_URL（必填）", "LIVEKIT_URL (required)")}
            />
            <SettingsInputField
              {...MANUAL_INPUT_PROPS}
              label="LiveKit API Key"
              maskedValue={livekitStatus?.livekitApiKeyMask}
              name="livekit-api-key"
              value={livekitForm.livekitApiKey}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitApiKey: event.target.value }))
              }
              placeholder="LIVEKIT_API_KEY"
            />
            <SettingsInputField
              {...MANUAL_SECRET_INPUT_PROPS}
              label="LiveKit API Secret"
              maskedValue={livekitStatus?.livekitApiSecretMask}
              type="password"
              name="livekit-api-secret"
              value={livekitForm.livekitApiSecret}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitApiSecret: event.target.value }))
              }
              placeholder="LIVEKIT_API_SECRET"
            />

            <div className="key-form-actions">
              <button type="submit" className="primary-btn" disabled={livekitLoading}>
                {livekitLoading ? t("保存中...", "Saving...") : t("保存", "Save")}
              </button>
              <button type="button" className="ghost-btn" disabled={livekitLoading} onClick={() => void onClearLivekit()}>
                {t("清空", "Clear")}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={livekitLoading}
                onClick={() => void onRefreshLivekitStatus()}
              >
                {t("刷新", "Refresh")}
              </button>
            </div>
          </form>

          {livekitError ? <p className="form-error">{livekitError}</p> : null}
        </div>
      )}
    </details>
  );
}
