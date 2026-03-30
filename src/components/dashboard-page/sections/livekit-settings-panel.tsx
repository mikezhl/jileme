import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import { type UiLanguage } from "@/lib/ui-language";

import {
  MANUAL_INPUT_PROPS,
  MANUAL_SECRET_INPUT_PROPS,
  type DashboardTranslate,
  type LivekitFormState,
  type LivekitStatus,
} from "../dashboard-page-support";

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
    <div className="settings-card">
      <div className="settings-card-header">
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          {t("配置 LiveKit 通话", "Configure LiveKit Transport")}
          <span className={`setting-status-badge ${isConfigured ? 'configured' : 'unconfigured'}`}>
            {isConfigured ? t("已配置", "Configured") : t("未配置", "Not configured")}
          </span>
        </h3>
        <p>
          {t(
            "这一组配置只负责 LiveKit 通话接入，与实时转录平台分开保存。启用用户 Key 模式时，房主必须同时具备完整的 LiveKit 与默认转录工具配置，系统不会混用平台和个人 Key。",
            "These credentials only cover LiveKit transport and are stored separately from realtime transcription providers. In user-key modes, the room owner must have both a complete LiveKit bundle and a configured default transcription provider. Platform and personal keys are never mixed.",
          )}
        </p>
      </div>

      {!isAuthenticated ? (
        <div>
          <p className="panel-tip">
            {t(
              "登录后可单独保存你自己的 LiveKit 通话配置。",
              "Sign in to store your own LiveKit transport settings separately.",
            )}
          </p>
        </div>
      ) : (
        <div className="settings-card-content">
          <form className="key-form" onSubmit={(event) => void onSaveLivekit(event)} autoComplete="off">
            <input
              {...MANUAL_INPUT_PROPS}
              type="url"
              inputMode="url"
              name="livekit-url"
              value={livekitForm.livekitUrl}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitUrl: event.target.value }))
              }
              placeholder={livekitStatus?.livekitUrlMask || t("LIVEKIT_URL（必填）", "LIVEKIT_URL (required)")}
            />
            <input
              {...MANUAL_INPUT_PROPS}
              name="livekit-api-key"
              value={livekitForm.livekitApiKey}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitApiKey: event.target.value }))
              }
              placeholder={livekitStatus?.livekitApiKeyMask || "LIVEKIT_API_KEY"}
            />
            <input
              {...MANUAL_SECRET_INPUT_PROPS}
              type="password"
              name="livekit-api-secret"
              value={livekitForm.livekitApiSecret}
              onChange={(event) =>
                setLivekitForm((current) => ({ ...current, livekitApiSecret: event.target.value }))
              }
              placeholder={livekitStatus?.livekitApiSecretMask || "LIVEKIT_API_SECRET"}
            />

            <div className="key-form-actions">
              <button type="submit" className="primary-btn" disabled={livekitLoading}>
                {livekitLoading ? t("保存中...", "Saving...") : t("保存配置", "Save Settings")}
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
                {t("刷新状态", "Refresh status")}
              </button>
            </div>
          </form>

          {livekitError ? <p className="form-error">{livekitError}</p> : null}
        </div>
      )}
    </div>
  );
}
