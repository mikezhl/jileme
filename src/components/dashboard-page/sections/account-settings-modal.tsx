import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  type ChangePasswordFormState,
  type ChangeUsernameFormState,
  type DashboardTranslate,
  type UserInfo,
} from "../dashboard-page-support";

type AccountSettingsModalProps = {
  changePasswordCodeCountdown: number;
  changePasswordCodeLoading: boolean;
  changePasswordCodeMessage: string;
  changePasswordError: string;
  changePasswordForm: ChangePasswordFormState;
  changePasswordLoading: boolean;
  changeUsernameError: string;
  changeUsernameForm: ChangeUsernameFormState;
  changeUsernameLoading: boolean;
  changeUsernameSuccess: string;
  onClose: () => void;
  onSendChangePasswordCode: () => Promise<void>;
  onSubmitChangePassword: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSubmitChangeUsername: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setChangePasswordForm: Dispatch<SetStateAction<ChangePasswordFormState>>;
  setChangeUsernameForm: Dispatch<SetStateAction<ChangeUsernameFormState>>;
  t: DashboardTranslate;
  user: UserInfo;
};

export function AccountSettingsModal({
  changePasswordCodeCountdown,
  changePasswordCodeLoading,
  changePasswordCodeMessage,
  changePasswordError,
  changePasswordForm,
  changePasswordLoading,
  changeUsernameError,
  changeUsernameForm,
  changeUsernameLoading,
  changeUsernameSuccess,
  onClose,
  onSendChangePasswordCode,
  onSubmitChangePassword,
  onSubmitChangeUsername,
  setChangePasswordForm,
  setChangeUsernameForm,
  t,
  user,
}: AccountSettingsModalProps) {
  const title = t("账号设置", "Account Settings");

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true">
      <section className="auth-modal account-settings-modal">
        <header className="auth-modal-header">
          <h2>{title}</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </header>

        <div className="account-settings-content">
          <div className="settings-field-block">
            <span className="settings-field-label">{t("账号邮箱", "Account Email")}</span>
            {user.email ? (
              <span className="settings-field-value">{user.email}</span>
            ) : (
              <span className="settings-field-value text-muted">{t("未绑定邮箱 (旧账号)", "No email bound (Legacy)")}</span>
            )}
          </div>

          <form className="settings-field-block" onSubmit={(event) => void onSubmitChangeUsername(event)}>
            <label htmlFor="account-username" className="settings-field-label">
              {t("用户名", "Username")}
            </label>
            <div className="inline-action-row">
              <input
                id="account-username"
                value={changeUsernameForm.username}
                onChange={(event) => setChangeUsernameForm({ username: event.target.value })}
                placeholder={t("3-32 位：小写字母/数字/_", "3-32 chars: lowercase letters/numbers/_")}
                autoComplete="username"
              />
              <button type="submit" className="ghost-btn inline-action-btn" disabled={changeUsernameLoading}>
                {changeUsernameLoading ? t("保存...", "Saving...") : t("更新", "Update")}
              </button>
            </div>
            {changeUsernameSuccess ? <p className="form-success" style={{ margin: 0 }}>{changeUsernameSuccess}</p> : null}
            {changeUsernameError ? <p className="form-error" style={{ margin: 0 }}>{changeUsernameError}</p> : null}
          </form>

          <form className="settings-field-block" onSubmit={(event) => void onSubmitChangePassword(event)}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="settings-field-label">{t("修改密码", "Change Password")}</span>
              {user.email ? (
                <p className="settings-field-desc">{t(`验证码将发送至 ${user.email}`, `Verification code will be sent to ${user.email}`)}</p>
              ) : (
                <p className="settings-field-desc">
                  {t(
                    "由于账号未绑定邮箱，请输入当前密码验证身份。",
                    "Since this account has no email, verify using your current password.",
                  )}
                </p>
              )}
            </div>

            {user.email ? (
              <div className="inline-action-row">
                <label htmlFor="change-password-code" className="sr-only" style={{ display: 'none' }}>{t("邮箱验证码", "Email Verification Code")}</label>
                <input
                  id="change-password-code"
                  value={changePasswordForm.verificationCode}
                  onChange={(event) =>
                    setChangePasswordForm((current) => ({
                      ...current,
                      verificationCode: event.target.value,
                    }))
                  }
                  placeholder={t("输入 4 位验证码", "Enter 4-digit code")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={4}
                />
                <button
                  type="button"
                  className="ghost-btn inline-action-btn"
                  disabled={changePasswordCodeLoading || changePasswordCodeCountdown > 0}
                  onClick={() => void onSendChangePasswordCode()}
                >
                  {changePasswordCodeLoading
                    ? t("发送中...", "Sending...")
                    : changePasswordCodeCountdown > 0
                      ? t(`${changePasswordCodeCountdown} 秒后重发`, `Retry in ${changePasswordCodeCountdown}s`)
                      : t("发送验证码", "Send Code")}
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="change-password-current" className="sr-only" style={{ display: 'none' }}>{t("当前密码", "Current Password")}</label>
                <input
                  id="change-password-current"
                  type="password"
                  value={changePasswordForm.currentPassword}
                  onChange={(event) =>
                    setChangePasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))
                  }
                  placeholder={t("请输入当前密码", "Enter current password")}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </>
            )}

            <label htmlFor="change-password-next" className="sr-only" style={{ display: 'none' }}>{t("新密码", "New Password")}</label>
            <input
              id="change-password-next"
              type="password"
              value={changePasswordForm.newPassword}
              onChange={(event) =>
                setChangePasswordForm((current) => ({
                  ...current,
                  newPassword: event.target.value,
                }))
              }
              placeholder={t("新密码（至少 6 位）", "New password (min 6 chars)")}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
            />

            <button type="submit" className="primary-btn" disabled={changePasswordLoading} style={{ marginTop: 4 }}>
              {changePasswordLoading ? t("更新中...", "Updating...") : t("更新密码", "Update Password")}
            </button>

            {changePasswordCodeMessage ? <p className="panel-tip" style={{ margin: 0 }}>{changePasswordCodeMessage}</p> : null}
            {changePasswordError ? <p className="form-error" style={{ margin: 0 }}>{changePasswordError}</p> : null}
          </form>
        </div>
      </section>
    </div>
  );
}
