import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import { isLinuxDoConnectVirtualEmail } from "@/lib/linux-do-connect";

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
  const isLinuxDoUser = isLinuxDoConnectVirtualEmail(user.email);
  const canResetPasswordByEmail = Boolean(user.email) && !isLinuxDoUser;
  const needsCurrentPassword = !user.email;

  return (
    <div
      className="auth-modal-overlay"
      role="dialog"
      aria-label={title}
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="auth-modal account-settings-modal">
        <div className="account-settings-content">
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

          <div className="settings-field-block">
            <span className="settings-field-label">{t("账号邮箱", "Account Email")}</span>
            {user.email ? (
              <span className="settings-field-value">{user.email}</span>
            ) : (
              <span className="settings-field-value text-muted">{t("未绑定邮箱 (旧账号)", "No email bound (Legacy)")}</span>
            )}
          </div>

          <form className="settings-field-block account-password-block" onSubmit={(event) => void onSubmitChangePassword(event)}>
            <div className="account-password-head">
              <span className="settings-field-label">{t("修改密码", "Change Password")}</span>
              {canResetPasswordByEmail ? (
                <p className="settings-field-desc">{t(`验证码将发送至 ${user.email}`, `Verification code will be sent to ${user.email}`)}</p>
              ) : isLinuxDoUser ? (
                <p className="settings-field-desc">
                  {t(
                    "当前账号只能通过 Linux Do Connect 登录",
                    "This account can only sign in with Linux Do Connect",
                  )}
                </p>
              ) : (
                <p className="settings-field-desc">
                  {t(
                    "由于账号未绑定邮箱，请输入当前密码验证身份。",
                    "Since this account has no email, verify using your current password.",
                  )}
                </p>
              )}
            </div>

            {canResetPasswordByEmail ? (
              <div className="inline-action-row">
                <label htmlFor="change-password-code" className="sr-only" style={{ display: "none" }}>
                  {t("邮箱验证码", "Email Verification Code")}
                </label>
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
            ) : needsCurrentPassword ? (
              <>
                <label htmlFor="change-password-current" className="sr-only" style={{ display: "none" }}>
                  {t("当前密码", "Current Password")}
                </label>
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
            ) : null}

            {isLinuxDoUser ? null : (
              <>
                <label htmlFor="change-password-next" className="sr-only" style={{ display: "none" }}>
                  {t("新密码", "New Password")}
                </label>
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

                <button type="submit" className="primary-btn" disabled={changePasswordLoading}>
                  {changePasswordLoading ? t("更新中...", "Updating...") : t("更新密码", "Update Password")}
                </button>
              </>
            )}

            {changePasswordCodeMessage ? <p className="panel-tip" style={{ margin: 0 }}>{changePasswordCodeMessage}</p> : null}
            {changePasswordError ? <p className="form-error" style={{ margin: 0 }}>{changePasswordError}</p> : null}
          </form>
        </div>
      </section>
    </div>
  );
}
