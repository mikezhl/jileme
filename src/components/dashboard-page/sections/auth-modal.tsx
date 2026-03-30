import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  type AuthFormState,
  type DashboardAuthMode,
  type DashboardTranslate,
} from "../dashboard-page-support";

type AuthModalProps = {
  authCodeCountdown: number;
  authCodeLoading: boolean;
  authCodeMessage: string;
  authError: string;
  authForm: AuthFormState;
  authLoading: boolean;
  authMode: NonNullable<DashboardAuthMode>;
  authNextPath: string | null;
  authTitle: string;
  onClose: () => void;
  onSendCode: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSwitchMode: (mode: NonNullable<DashboardAuthMode>) => void;
  setAuthForm: Dispatch<SetStateAction<AuthFormState>>;
  t: DashboardTranslate;
};

export function AuthModal({
  authCodeCountdown,
  authCodeLoading,
  authCodeMessage,
  authError,
  authForm,
  authLoading,
  authMode,
  authNextPath,
  authTitle,
  onClose,
  onSendCode,
  onSubmit,
  onSwitchMode,
  setAuthForm,
  t,
}: AuthModalProps) {
  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true">
      <section className="auth-modal">
        <header className="auth-modal-header">
          <h2>{authTitle}</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </header>

        <div className="auth-switch-row">
          <button
            type="button"
            className={authMode === "login" ? "switch-btn active" : "switch-btn"}
            onClick={() => onSwitchMode("login")}
          >
            {t("登录", "Sign In")}
          </button>
          <button
            type="button"
            className={authMode === "register" ? "switch-btn active" : "switch-btn"}
            onClick={() => onSwitchMode("register")}
          >
            {t("注册", "Sign Up")}
          </button>
        </div>

        {authNextPath ? (
          <p className="panel-tip">
            {t("登录后将继续访问：", "After signing in, you will continue to: ")}
            {authNextPath}
          </p>
        ) : null}

        <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
          {authMode === "login" ? (
            <>
              <label htmlFor="auth-identifier">{t("用户名 / 邮箱", "Username / Email")}</label>
              <input
                id="auth-identifier"
                value={authForm.identifier}
                onChange={(event) => setAuthForm((current) => ({ ...current, identifier: event.target.value }))}
                placeholder={t("输入用户名或邮箱", "Enter your username or email")}
                autoComplete="username"
              />
            </>
          ) : (
            <>
              <label htmlFor="auth-username">{t("用户名", "Username")}</label>
              <input
                id="auth-username"
                value={authForm.username}
                onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                placeholder={t("3-32 位：小写字母/数字/_", "3-32 chars: lowercase letters/numbers/_")}
                autoComplete="username"
              />

              <label htmlFor="auth-email">{t("邮箱", "Email")}</label>
              <input
                id="auth-email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t("请输入邮箱", "Enter your email")}
                autoComplete="email"
              />

              <label htmlFor="auth-verification-code">{t("验证码", "Verification Code")}</label>
              <div className="inline-action-row">
                <input
                  id="auth-verification-code"
                  value={authForm.verificationCode}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, verificationCode: event.target.value }))
                  }
                  placeholder={t("4 位数字", "4 digits")}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={4}
                />
                <button
                  type="button"
                  className="ghost-btn inline-action-btn"
                  disabled={authCodeLoading || authCodeCountdown > 0}
                  onClick={() => void onSendCode()}
                >
                  {authCodeLoading
                    ? t("发送中...", "Sending...")
                    : authCodeCountdown > 0
                      ? t(`${authCodeCountdown} 秒后重发`, `Retry in ${authCodeCountdown}s`)
                      : t("发送验证码", "Send Code")}
                </button>
              </div>
            </>
          )}

          <label htmlFor="auth-password">{t("密码", "Password")}</label>
          <input
            id="auth-password"
            type="password"
            value={authForm.password}
            onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
            placeholder={t("至少 6 位", "At least 6 characters")}
            autoComplete={authMode === "login" ? "current-password" : "new-password"}
          />

          <button type="submit" className="primary-btn" disabled={authLoading}>
            {authLoading ? `${authTitle}${t("中...", "...")}` : authTitle}
          </button>
        </form>

        {authCodeMessage ? <p className="panel-tip">{authCodeMessage}</p> : null}
        {authError ? <p className="form-error">{authError}</p> : null}
      </section>
    </div>
  );
}
