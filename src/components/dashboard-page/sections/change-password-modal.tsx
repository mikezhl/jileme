import { type Dispatch, type FormEvent, type SetStateAction } from "react";

import {
  type ChangePasswordFormState,
  type DashboardTranslate,
} from "../dashboard-page-support";

type ChangePasswordModalProps = {
  changePasswordError: string;
  changePasswordForm: ChangePasswordFormState;
  changePasswordLoading: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setChangePasswordForm: Dispatch<SetStateAction<ChangePasswordFormState>>;
  t: DashboardTranslate;
};

export function ChangePasswordModal({
  changePasswordError,
  changePasswordForm,
  changePasswordLoading,
  onClose,
  onSubmit,
  setChangePasswordForm,
  t,
}: ChangePasswordModalProps) {
  const title = t("修改密码", "Change Password");

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true">
      <section className="auth-modal">
        <header className="auth-modal-header">
          <h2>{title}</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </header>

        <form className="auth-form modal-auth-form" onSubmit={(event) => void onSubmit(event)}>
          <label htmlFor="change-password-current">{t("当前密码", "Current Password")}</label>
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

          <label htmlFor="change-password-next">{t("新密码", "New Password")}</label>
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
            placeholder={t("至少 6 位", "At least 6 characters")}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
          />

          <label htmlFor="change-password-confirm">{t("确认新密码", "Confirm New Password")}</label>
          <input
            id="change-password-confirm"
            type="password"
            value={changePasswordForm.confirmPassword}
            onChange={(event) =>
              setChangePasswordForm((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))
            }
            placeholder={t("再次输入新密码", "Re-enter new password")}
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
          />

          <button type="submit" className="primary-btn" disabled={changePasswordLoading}>
            {changePasswordLoading ? `${title}${t("中...", "...")}` : title}
          </button>
        </form>

        {changePasswordError ? <p className="form-error">{changePasswordError}</p> : null}
      </section>
    </div>
  );
}
