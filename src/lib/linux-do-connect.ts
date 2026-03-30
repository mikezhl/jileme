export const LINUX_DO_CONNECT_AUTHORIZE_URL = "https://connect.linux.do/oauth2/authorize";
export const LINUX_DO_CONNECT_TOKEN_URL = "https://connect.linux.do/oauth2/token";
export const LINUX_DO_CONNECT_USER_URL = "https://connect.linux.do/api/user";
export const LINUX_DO_CONNECT_VIRTUAL_EMAIL_DOMAIN = "linuxdo.connect";
export const LINUX_DO_CONNECT_STATE_COOKIE_NAME = "jileme_linux_do_connect_state";
export const LINUX_DO_CONNECT_NEXT_COOKIE_NAME = "jileme_linux_do_connect_next";
export const LINUX_DO_CONNECT_MODE_COOKIE_NAME = "jileme_linux_do_connect_mode";
export const LINUX_DO_CONNECT_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export type LinuxDoConnectMode = "login" | "register";

export type LinuxDoConnectTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type LinuxDoConnectUserResponse = {
  id?: number | string;
  username?: string;
  name?: string | null;
  avatar_template?: string | null;
  active?: boolean;
  trust_level?: number;
  silenced?: boolean;
  api_key?: string;
};

export function normalizeLinuxDoConnectMode(value?: string | null): LinuxDoConnectMode {
  return value === "register" ? "register" : "login";
}

export function normalizeLinuxDoConnectNextPath(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }

  return value;
}

export function buildLinuxDoConnectAuthorizationUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(LINUX_DO_CONNECT_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export function buildLinuxDoConnectVirtualEmail(id: string | number) {
  return `linuxdo-${String(id).trim().toLowerCase()}@${LINUX_DO_CONNECT_VIRTUAL_EMAIL_DOMAIN}`;
}

export function isLinuxDoConnectVirtualEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return normalized?.endsWith(`@${LINUX_DO_CONNECT_VIRTUAL_EMAIL_DOMAIN}`) ?? false;
}
