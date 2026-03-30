"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { type UiLanguage } from "@/lib/ui-language";

import {
  type ChangePasswordFormState,
  type ChangeUsernameFormState,
  emptyProviderForm,
  isBlank,
  normalizeNextPath,
  type AuthFormState,
  type AuthResponse,
  type DashboardPageClientProps,
  type DashboardResponse,
  type DashboardTranslate,
  type LivekitFormState,
  type LivekitStatus,
  type LlmFormState,
  type LlmKeyStatus,
  type PublicRoomsResponse,
  type RoomAction,
  type StatusResponse,
  type TranscriptionProviderName,
  type TranscriptionSettingsStatus,
  type UserInfo,
  type UsageSummary,
  type VerificationCodeResponse,
} from "./dashboard-page-support";

type UseDashboardStateArgs = DashboardPageClientProps & {
  language: UiLanguage;
  t: DashboardTranslate;
};

export function useDashboardState({
  initialUser,
  initialCreatedRooms,
  initialJoinedRooms,
  initialPublicRooms,
  initialPublicRoomsPage,
  initialPublicRoomsTotalCount,
  initialPublicRoomsTotalPages,
  initialLivekitStatus,
  initialTranscriptionStatus,
  initialLlmKeyStatus,
  initialUsageSummary,
  initialAuthMode,
  initialNextPath,
  language,
  t,
}: UseDashboardStateArgs) {
  const router = useRouter();

  function emptyAuthForm(): AuthFormState {
    return {
      email: "",
      identifier: "",
      verificationCode: "",
      username: "",
      password: "",
    };
  }

  function emptyUsernameForm(username = ""): ChangeUsernameFormState {
    return { username };
  }

  function emptyPasswordForm(): ChangePasswordFormState {
    return {
      currentPassword: "",
      verificationCode: "",
      newPassword: "",
    };
  }

  const [user, setUser] = useState<UserInfo | null>(initialUser);
  const [createdRooms, setCreatedRooms] = useState(initialCreatedRooms);
  const [joinedRooms, setJoinedRooms] = useState(initialJoinedRooms);
  const [publicRooms, setPublicRooms] = useState(initialPublicRooms);
  const [publicRoomsPage, setPublicRoomsPage] = useState(initialPublicRoomsPage);
  const [publicRoomsTotalCount, setPublicRoomsTotalCount] = useState(initialPublicRoomsTotalCount);
  const [publicRoomsTotalPages, setPublicRoomsTotalPages] = useState(initialPublicRoomsTotalPages);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(false);
  const [publicRoomsError, setPublicRoomsError] = useState("");
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(initialUsageSummary);
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  const [roomActionError, setRoomActionError] = useState("");
  const [roomActionLoading, setRoomActionLoading] = useState<RoomAction | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [livekitStatus, setLivekitStatus] = useState<LivekitStatus | null>(initialLivekitStatus);
  const [livekitForm, setLivekitForm] = useState<LivekitFormState>({
    livekitUrl: "",
    livekitApiKey: "",
    livekitApiSecret: "",
  });
  const [livekitLoading, setLivekitLoading] = useState(false);
  const [livekitError, setLivekitError] = useState("");

  const [transcriptionStatus, setTranscriptionStatus] =
    useState<TranscriptionSettingsStatus | null>(initialTranscriptionStatus);
  const [transcriptionForm, setTranscriptionForm] = useState(emptyProviderForm());
  const [transcriptionLoading, setTranscriptionLoading] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState("");

  const [llmKeyStatus, setLlmKeyStatus] = useState<LlmKeyStatus | null>(initialLlmKeyStatus);
  const [llmForm, setLlmForm] = useState<LlmFormState>({ baseUrl: "", apiKey: "", model: "" });
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState("");

  const [authMode, setAuthMode] = useState(initialAuthMode);
  const [authNextPath, setAuthNextPath] = useState<string | null>(normalizeNextPath(initialNextPath));
  const [authForm, setAuthForm] = useState<AuthFormState>(emptyAuthForm());
  const [authLoading, setAuthLoading] = useState(false);
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [authCodeCountdown, setAuthCodeCountdown] = useState(0);
  const [authCodeMessage, setAuthCodeMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [pendingRoomAction, setPendingRoomAction] = useState<RoomAction | null>(null);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [changeUsernameForm, setChangeUsernameForm] = useState<ChangeUsernameFormState>(
    emptyUsernameForm(initialUser?.username ?? ""),
  );
  const [changeUsernameLoading, setChangeUsernameLoading] = useState(false);
  const [changeUsernameError, setChangeUsernameError] = useState("");
  const [changeUsernameSuccess, setChangeUsernameSuccess] = useState("");
  const [changePasswordForm, setChangePasswordForm] = useState<ChangePasswordFormState>(emptyPasswordForm());
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordCodeLoading, setChangePasswordCodeLoading] = useState(false);
  const [changePasswordCodeCountdown, setChangePasswordCodeCountdown] = useState(0);
  const [changePasswordCodeMessage, setChangePasswordCodeMessage] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");

  const isAuthenticated = Boolean(user);
  const hasHistory = createdRooms.length > 0 || joinedRooms.length > 0;
  const authTitle = authMode === "register" ? t("注册", "Sign Up") : t("登录", "Sign In");

  useEffect(() => {
    if (authCodeCountdown <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setAuthCodeCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [authCodeCountdown]);

  useEffect(() => {
    if (changePasswordCodeCountdown <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setChangePasswordCodeCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [changePasswordCodeCountdown]);

  function resetAuthFeedback() {
    setAuthError("");
    setAuthCodeMessage("");
  }

  function startAuthCodeCountdown(seconds: number | null | undefined) {
    setAuthCodeCountdown(Math.max(0, Math.ceil(seconds ?? 60)));
  }

  function startChangePasswordCodeCountdown(seconds: number | null | undefined) {
    setChangePasswordCodeCountdown(Math.max(0, Math.ceil(seconds ?? 60)));
  }

  function switchAuthMode(mode: NonNullable<typeof authMode>) {
    setAuthMode(mode);
    resetAuthFeedback();
  }

  function openAuthModal(mode: NonNullable<typeof authMode>, nextPath?: unknown) {
    switchAuthMode(mode);
    if (nextPath === null || typeof nextPath === "string") {
      setAuthNextPath(normalizeNextPath(nextPath));
    }
  }

  function openLoginModal(nextPath?: string | null) {
    setPendingRoomAction(null);
    openAuthModal("login", nextPath);
  }

  function openRegisterModal(nextPath?: string | null) {
    setPendingRoomAction(null);
    openAuthModal("register", nextPath);
  }

  function closeAuthModal() {
    setAuthMode(null);
    resetAuthFeedback();
  }

  function clearDataAfterLogout() {
    setUser(null);
    setCreatedRooms([]);
    setJoinedRooms([]);
    setUsageSummary(null);
    setLivekitStatus(null);
    setTranscriptionStatus(null);
    setLlmKeyStatus(null);
    setLivekitForm({ livekitUrl: "", livekitApiKey: "", livekitApiSecret: "" });
    setTranscriptionForm(emptyProviderForm());
    setLlmForm({ baseUrl: "", apiKey: "", model: "" });
    setAuthForm(emptyAuthForm());
    setAuthCodeCountdown(0);
    setChangeUsernameForm(emptyUsernameForm());
    setChangePasswordForm(emptyPasswordForm());
    setChangePasswordCodeCountdown(0);
    setAccountSettingsOpen(false);
    setLivekitError("");
    setTranscriptionError("");
    setLlmError("");
    setAuthCodeMessage("");
    setChangeUsernameError("");
    setChangeUsernameSuccess("");
    setChangePasswordCodeMessage("");
  }

  async function readJson<T>(response: Response, fallback: string): Promise<T> {
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      if (response.status === 401) {
        clearDataAfterLogout();
        openAuthModal("login");
      }
      throw new Error(payload.error ?? fallback);
    }
    return payload;
  }

  async function getProtected<T>(url: string, fallback: string) {
    return readJson<T>(await fetch(url, { cache: "no-store" }), fallback);
  }

  async function postProtected<T>(url: string, body: unknown, fallback: string) {
    return readJson<T>(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      fallback,
    );
  }

  async function postVerificationCode(body: unknown, fallback: string) {
    const response = await fetch("/api/auth/send-email-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as VerificationCodeResponse;

    if (!response.ok) {
      if (response.status === 401) {
        clearDataAfterLogout();
        openAuthModal("login");
      }

      const error = new Error(payload.error ?? fallback) as Error & {
        retryAfterSeconds?: number;
      };
      error.retryAfterSeconds = payload.retryAfterSeconds;
      throw error;
    }

    return payload;
  }

  async function loadAuthenticatedData() {
    const [dashboard, livekit, transcription, llm] = await Promise.all([
      getProtected<DashboardResponse>(
        "/api/rooms/dashboard",
        t("获取历史房间失败", "Failed to load room history"),
      ),
      getProtected<StatusResponse<LivekitStatus>>(
        "/api/account/livekit",
        t("读取 LiveKit 状态失败", "Failed to read LiveKit status"),
      ),
      getProtected<StatusResponse<TranscriptionSettingsStatus>>(
        "/api/account/transcription",
        t("读取转录配置失败", "Failed to read transcription settings"),
      ),
      getProtected<StatusResponse<LlmKeyStatus>>(
        "/api/account/llm",
        t("读取 LLM 状态失败", "Failed to read LLM status"),
      ),
    ]);

    setCreatedRooms(dashboard.createdRooms);
    setJoinedRooms(dashboard.joinedRooms);
    setUsageSummary(dashboard.usage);
    setLivekitStatus(livekit.status);
    setTranscriptionStatus(transcription.status);
    setLlmKeyStatus(llm.status);
  }

  async function requireAuthForRoomAction(action: RoomAction) {
    if (isAuthenticated) {
      return true;
    }

    setPendingRoomAction(action);
    setRoomActionError(t("请先登录后再操作。", "Please sign in first."));
    openAuthModal("login");
    return false;
  }

  async function bootstrapRoom(action: RoomAction) {
    if (action === "join" && !roomIdToJoin.trim()) {
      setRoomActionError(t("请输入房间号。", "Please enter a room ID."));
      return;
    }

    setRoomActionLoading(action);
    setRoomActionError("");

    try {
      const payload = await postProtected<{ roomId?: string }>(
        "/api/rooms/bootstrap",
        action === "create"
          ? { action, uiLanguage: language }
          : { action, roomId: roomIdToJoin.trim() },
        t("房间操作失败", "Room action failed"),
      );
      if (!payload.roomId) {
        throw new Error(t("房间操作失败", "Room action failed"));
      }

      setPendingRoomAction(null);
      router.push(`/${encodeURIComponent(payload.roomId)}`);
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : t("房间操作失败", "Room action failed"));
    } finally {
      setRoomActionLoading(null);
    }
  }

  async function loadPublicRoomsPage(page: number) {
    setPublicRoomsLoading(true);
    setPublicRoomsError("");

    try {
      const endpoint = new URL("/api/rooms/public", window.location.origin);
      endpoint.searchParams.set("page", String(page));
      const payload = await readJson<PublicRoomsResponse>(
        await fetch(endpoint.toString(), { cache: "no-store" }),
        t("获取公开房间失败", "Failed to load public rooms"),
      );

      setPublicRooms(payload.rooms);
      setPublicRoomsPage(payload.page);
      setPublicRoomsTotalCount(payload.totalCount);
      setPublicRoomsTotalPages(payload.totalPages);
    } catch (error) {
      setPublicRoomsError(
        error instanceof Error ? error.message : t("获取公开房间失败", "Failed to load public rooms"),
      );
    } finally {
      setPublicRoomsLoading(false);
    }
  }

  async function sendRegisterVerificationCode() {
    if (!authForm.email.trim()) {
      setAuthError(t("请先填写邮箱。", "Please enter your email first."));
      return;
    }
    if (authCodeCountdown > 0) {
      return;
    }

    setAuthCodeLoading(true);
    setAuthError("");
    setAuthCodeMessage("");

    try {
      const payload = await postVerificationCode(
        {
          email: authForm.email,
          purpose: "register",
        },
        t("发送验证码失败", "Failed to send verification code"),
      );
      startAuthCodeCountdown(payload.retryAfterSeconds);
      setAuthCodeMessage(
        t(
          `验证码已发送至 ${payload.targetEmail ?? authForm.email.trim()}。`,
          `Verification code sent to ${payload.targetEmail ?? authForm.email.trim()}.`,
        ),
      );
    } catch (error) {
      const retryAfterSeconds =
        error instanceof Error && "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number"
          ? error.retryAfterSeconds
          : null;
      if (retryAfterSeconds) {
        startAuthCodeCountdown(retryAfterSeconds);
      }
      setAuthError(error instanceof Error ? error.message : t("发送验证码失败", "Failed to send verification code"));
    } finally {
      setAuthCodeLoading(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authMode) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const payload = await postProtected<AuthResponse>(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        authMode === "login"
          ? {
              identifier: authForm.identifier,
              password: authForm.password,
            }
          : {
              email: authForm.email,
              password: authForm.password,
              username: authForm.username,
              verificationCode: authForm.verificationCode,
            },
        `${authTitle}${t("失败", " failed")}`,
      );
      if (!payload.user) {
        throw new Error(`${authTitle}${t("失败", " failed")}`);
      }

      setUser(payload.user);
      setAuthMode(null);
      setAuthForm(emptyAuthForm());
      setAuthCodeMessage("");
      setChangeUsernameForm(emptyUsernameForm(payload.user.username));
      await loadAuthenticatedData();

      if (authNextPath) {
        const target = authNextPath;
        setAuthNextPath(null);
        router.replace(target);
        return;
      }

      if (pendingRoomAction) {
        const action = pendingRoomAction;
        setPendingRoomAction(null);
        await bootstrapRoom(action);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : `${authTitle}${t("失败", " failed")}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCreateRoom() {
    const canContinue = await requireAuthForRoomAction("create");
    if (canContinue) {
      await bootstrapRoom("create");
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canContinue = await requireAuthForRoomAction("join");
    if (canContinue) {
      await bootstrapRoom("join");
    }
  }

  async function refreshDashboard() {
    if (!isAuthenticated) {
      return;
    }

    setDashboardLoading(true);
    setRoomActionError("");

    try {
      const payload = await getProtected<DashboardResponse>(
        "/api/rooms/dashboard",
        t("获取历史房间失败", "Failed to load room history"),
      );
      setCreatedRooms(payload.createdRooms);
      setJoinedRooms(payload.joinedRooms);
      setUsageSummary(payload.usage);
    } catch (error) {
      setRoomActionError(
        error instanceof Error ? error.message : t("获取历史房间失败", "Failed to load room history"),
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  async function refreshLivekitStatus() {
    try {
      const payload = await getProtected<StatusResponse<LivekitStatus>>(
        "/api/account/livekit",
        t("读取 LiveKit 状态失败", "Failed to read LiveKit status"),
      );
      setLivekitStatus(payload.status);
    } catch (error) {
      setLivekitError(
        error instanceof Error ? error.message : t("读取 LiveKit 状态失败", "Failed to read LiveKit status"),
      );
    }
  }

  async function refreshTranscriptionStatus() {
    try {
      const payload = await getProtected<StatusResponse<TranscriptionSettingsStatus>>(
        "/api/account/transcription",
        t("读取转录配置失败", "Failed to read transcription settings"),
      );
      setTranscriptionStatus(payload.status);
    } catch (error) {
      setTranscriptionError(
        error instanceof Error
          ? error.message
          : t("读取转录配置失败", "Failed to read transcription settings"),
      );
    }
  }

  async function refreshLlmStatus() {
    try {
      const payload = await getProtected<StatusResponse<LlmKeyStatus>>(
        "/api/account/llm",
        t("读取 LLM 状态失败", "Failed to read LLM status"),
      );
      setLlmKeyStatus(payload.status);
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : t("读取 LLM 状态失败", "Failed to read LLM status"));
    }
  }

  async function saveLivekit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.values(livekitForm).some(isBlank)) {
      setLivekitError(
        t(
          "保存时必须同时填写 LiveKit URL、LiveKit API Key 和 LiveKit API Secret。",
          "LiveKit URL, LiveKit API key, and LiveKit API secret are required.",
        ),
      );
      return;
    }

    setLivekitLoading(true);
    setLivekitError("");

    try {
      const payload = await postProtected<StatusResponse<LivekitStatus>>(
        "/api/account/livekit",
        livekitForm,
        t("保存 LiveKit 配置失败", "Failed to save LiveKit settings"),
      );
      setLivekitStatus(payload.status);
      setLivekitForm({ livekitUrl: "", livekitApiKey: "", livekitApiSecret: "" });
    } catch (error) {
      setLivekitError(
        error instanceof Error ? error.message : t("保存 LiveKit 配置失败", "Failed to save LiveKit settings"),
      );
    } finally {
      setLivekitLoading(false);
    }
  }

  async function clearLivekit() {
    setLivekitLoading(true);
    setLivekitError("");

    try {
      const payload = await postProtected<StatusResponse<LivekitStatus>>(
        "/api/account/livekit",
        { clear: true },
        t("清空 LiveKit 配置失败", "Failed to clear LiveKit settings"),
      );
      setLivekitStatus(payload.status);
      setLivekitForm({ livekitUrl: "", livekitApiKey: "", livekitApiSecret: "" });
    } catch (error) {
      setLivekitError(
        error instanceof Error ? error.message : t("清空 LiveKit 配置失败", "Failed to clear LiveKit settings"),
      );
    } finally {
      setLivekitLoading(false);
    }
  }

  async function saveTranscription(
    event: FormEvent<HTMLFormElement>,
    provider: TranscriptionProviderName,
  ) {
    event.preventDefault();
    if (isBlank(transcriptionForm[provider])) {
      setTranscriptionError(t("API Key 为必填项。", "API key is required."));
      return;
    }

    setTranscriptionLoading(`save:${provider}`);
    setTranscriptionError("");

    try {
      const payload = await postProtected<StatusResponse<TranscriptionSettingsStatus>>(
        "/api/account/transcription",
        { action: "save", provider, apiKey: transcriptionForm[provider].trim() },
        t("保存转录配置失败", "Failed to save transcription settings"),
      );
      setTranscriptionStatus(payload.status);
      setTranscriptionForm((current) => ({ ...current, [provider]: "" }));
    } catch (error) {
      setTranscriptionError(
        error instanceof Error
          ? error.message
          : t("保存转录配置失败", "Failed to save transcription settings"),
      );
    } finally {
      setTranscriptionLoading(null);
    }
  }

  async function clearTranscription(provider: TranscriptionProviderName) {
    setTranscriptionLoading(`clear:${provider}`);
    setTranscriptionError("");

    try {
      const payload = await postProtected<StatusResponse<TranscriptionSettingsStatus>>(
        "/api/account/transcription",
        { action: "clear", provider },
        t("清空转录配置失败", "Failed to clear transcription settings"),
      );
      setTranscriptionStatus(payload.status);
      setTranscriptionForm((current) => ({ ...current, [provider]: "" }));
    } catch (error) {
      setTranscriptionError(
        error instanceof Error
          ? error.message
          : t("清空转录配置失败", "Failed to clear transcription settings"),
      );
    } finally {
      setTranscriptionLoading(null);
    }
  }

  async function setDefaultProvider(provider: TranscriptionProviderName | null) {
    setTranscriptionLoading(`default:${provider ?? "none"}`);
    setTranscriptionError("");

    try {
      const payload = await postProtected<StatusResponse<TranscriptionSettingsStatus>>(
        "/api/account/transcription",
        { action: "set-default", provider },
        t("更新默认转录工具失败", "Failed to update default transcription provider"),
      );
      setTranscriptionStatus(payload.status);
    } catch (error) {
      setTranscriptionError(
        error instanceof Error
          ? error.message
          : t("更新默认转录工具失败", "Failed to update default transcription provider"),
      );
    } finally {
      setTranscriptionLoading(null);
    }
  }

  async function saveLlm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.values(llmForm).some(isBlank)) {
      setLlmError(
        t(
          "保存时必须同时填写 LLM URL、LLM API Key 和 LLM Model。",
          "LLM URL, LLM API key, and LLM model are required.",
        ),
      );
      return;
    }

    setLlmLoading(true);
    setLlmError("");

    try {
      const payload = await postProtected<StatusResponse<LlmKeyStatus>>(
        "/api/account/llm",
        llmForm,
        t("保存 LLM 配置失败", "Failed to save LLM settings"),
      );
      setLlmKeyStatus(payload.status);
      setLlmForm({ baseUrl: "", apiKey: "", model: "" });
    } catch (error) {
      setLlmError(
        error instanceof Error ? error.message : t("保存 LLM 配置失败", "Failed to save LLM settings"),
      );
    } finally {
      setLlmLoading(false);
    }
  }

  async function clearLlm() {
    setLlmLoading(true);
    setLlmError("");

    try {
      const payload = await postProtected<StatusResponse<LlmKeyStatus>>(
        "/api/account/llm",
        { clear: true },
        t("清空 LLM 配置失败", "Failed to clear LLM settings"),
      );
      setLlmKeyStatus(payload.status);
      setLlmForm({ baseUrl: "", apiKey: "", model: "" });
    } catch (error) {
      setLlmError(
        error instanceof Error ? error.message : t("清空 LLM 配置失败", "Failed to clear LLM settings"),
      );
    } finally {
      setLlmLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearDataAfterLogout();
  }

  function openAccountSettingsModal() {
    setAccountSettingsOpen(true);
    setChangeUsernameError("");
    setChangeUsernameSuccess("");
    setChangePasswordError("");
    setChangePasswordCodeMessage("");
    setChangeUsernameForm(emptyUsernameForm(user?.username ?? ""));
    setChangePasswordForm(emptyPasswordForm());
  }

  function closeAccountSettingsModal() {
    setAccountSettingsOpen(false);
    setChangeUsernameError("");
    setChangeUsernameSuccess("");
    setChangePasswordError("");
    setChangePasswordCodeMessage("");
    setChangePasswordForm(emptyPasswordForm());
  }

  async function handleChangeUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    if (!changeUsernameForm.username.trim()) {
      setChangeUsernameError(t("请输入用户名。", "Please enter a username."));
      setChangeUsernameSuccess("");
      return;
    }

    setChangeUsernameLoading(true);
    setChangeUsernameError("");
    setChangeUsernameSuccess("");

    try {
      const payload = await postProtected<AuthResponse>(
        "/api/auth/change-username",
        {
          username: changeUsernameForm.username,
        },
        t("修改用户名失败", "Failed to change username"),
      );
      if (!payload.user) {
        throw new Error(t("修改用户名失败", "Failed to change username"));
      }

      setUser(payload.user);
      setChangeUsernameForm(emptyUsernameForm(payload.user.username));
      setChangeUsernameSuccess(t("用户名已更新。", "Username updated."));
    } catch (error) {
      setChangeUsernameError(error instanceof Error ? error.message : t("修改用户名失败", "Failed to change username"));
    } finally {
      setChangeUsernameLoading(false);
    }
  }

  async function sendChangePasswordVerificationCode() {
    if (!user?.email) {
      setChangePasswordError(
        t("当前账号未绑定邮箱，旧账号请使用当前密码改密。", "This account has no email. Legacy accounts must use the current password."),
      );
      return;
    }
    if (changePasswordCodeCountdown > 0) {
      return;
    }

    setChangePasswordCodeLoading(true);
    setChangePasswordError("");
    setChangePasswordCodeMessage("");

    try {
      const payload = await postVerificationCode(
        {
          purpose: "change-password",
        },
        t("发送验证码失败", "Failed to send verification code"),
      );
      startChangePasswordCodeCountdown(payload.retryAfterSeconds);
      setChangePasswordCodeMessage(
        t(
          `验证码已发送至 ${payload.targetEmail ?? user.email}。`,
          `Verification code sent to ${payload.targetEmail ?? user.email}.`,
        ),
      );
    } catch (error) {
      const retryAfterSeconds =
        error instanceof Error && "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number"
          ? error.retryAfterSeconds
          : null;
      if (retryAfterSeconds) {
        startChangePasswordCodeCountdown(retryAfterSeconds);
      }
      setChangePasswordError(error instanceof Error ? error.message : t("发送验证码失败", "Failed to send verification code"));
    } finally {
      setChangePasswordCodeLoading(false);
    }
  }

  async function handleChangePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!changePasswordForm.newPassword) {
      setChangePasswordError(t("请填写新密码。", "Please enter a new password."));
      return;
    }

    if (user?.email) {
      if (!changePasswordForm.verificationCode) {
        setChangePasswordError(t("请输入验证码。", "Please enter the verification code."));
        return;
      }
    } else if (!changePasswordForm.currentPassword) {
      setChangePasswordError(
        t("当前账号未绑定邮箱，请输入当前密码。", "This account has no email. Please enter the current password."),
      );
      return;
    }

    setChangePasswordLoading(true);
    setChangePasswordError("");

    try {
      await postProtected<{ ok: true }>(
        "/api/auth/change-password",
        {
          currentPassword: changePasswordForm.currentPassword,
          newPassword: changePasswordForm.newPassword,
          verificationCode: changePasswordForm.verificationCode,
        },
        t("修改密码失败", "Failed to change password"),
      );
      clearDataAfterLogout();
      setAuthMode("login");
      setAuthNextPath(null);
      setAuthError("");
      setAuthCodeMessage(t("密码已修改，请重新登录。", "Password updated. Please sign in again."));
    } catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : t("修改密码失败", "Failed to change password"));
    } finally {
      setChangePasswordLoading(false);
    }
  }

  return {
    accountSettingsOpen,
    authCodeCountdown,
    authCodeLoading,
    authCodeMessage,
    authError,
    authForm,
    authLoading,
    authMode,
    authNextPath,
    authTitle,
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
    clearLlm,
    clearLivekit,
    clearTranscription,
    closeAccountSettingsModal,
    closeAuthModal,
    createdRooms,
    dashboardLoading,
    handleAuthSubmit,
    handleCreateRoom,
    handleChangePasswordSubmit,
    handleChangeUsernameSubmit,
    handleJoinRoom,
    handleLogout,
    hasHistory,
    isAuthenticated,
    joinedRooms,
    livekitError,
    livekitForm,
    livekitLoading,
    livekitStatus,
    llmError,
    llmForm,
    llmKeyStatus,
    llmLoading,
    openLoginModal,
    openAccountSettingsModal,
    openRegisterModal,
    publicRooms,
    publicRoomsError,
    publicRoomsLoading,
    publicRoomsPage,
    publicRoomsTotalCount,
    publicRoomsTotalPages,
    loadPublicRoomsPage,
    refreshDashboard,
    refreshLivekitStatus,
    refreshLlmStatus,
    refreshTranscriptionStatus,
    roomActionError,
    roomActionLoading,
    roomIdToJoin,
    saveLivekit,
    saveLlm,
    saveTranscription,
    sendChangePasswordVerificationCode,
    sendRegisterVerificationCode,
    setAuthForm,
    setChangeUsernameForm,
    setChangePasswordForm,
    setDefaultProvider,
    setLivekitForm,
    setLlmForm,
    setRoomIdToJoin,
    switchAuthMode,
    setTranscriptionForm,
    transcriptionError,
    transcriptionForm,
    transcriptionLoading,
    transcriptionStatus,
    usageSummary,
    user,
  };
}

export type DashboardState = ReturnType<typeof useDashboardState>;
