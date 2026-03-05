"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type RoomSummary = {
  roomId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  participantCount: number;
  messageCount: number;
  joinedAt?: string;
};

type KeyStatus = {
  configured: boolean;
  livekitUrlMask: string | null;
  livekitApiKeyMask: string | null;
  livekitApiSecretMask: string | null;
  deepgramApiKeyMask: string | null;
};

type DashboardResponse = {
  createdRooms: RoomSummary[];
  joinedRooms: RoomSummary[];
  error?: string;
};

type KeyStatusResponse = {
  status: KeyStatus;
  error?: string;
};

type AuthResponse = {
  user?: {
    id: string;
    username: string;
  };
  error?: string;
};

type UserInfo = {
  id: string;
  username: string;
};

type AuthMode = "login" | "register";

type DashboardPageClientProps = {
  initialUser: UserInfo | null;
  initialCreatedRooms: RoomSummary[];
  initialJoinedRooms: RoomSummary[];
  initialKeyStatus: KeyStatus | null;
  initialAuthMode: AuthMode | null;
  initialNextPath: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function roomStatusLabel(status: string) {
  return status === "ENDED" ? "已结束" : "进行中";
}

function normalizeNextPath(raw: string | null | undefined) {
  if (!raw || !raw.startsWith("/")) {
    return null;
  }
  return raw;
}

export default function DashboardPageClient({
  initialUser,
  initialCreatedRooms,
  initialJoinedRooms,
  initialKeyStatus,
  initialAuthMode,
  initialNextPath,
}: DashboardPageClientProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(initialUser);

  const [createdRooms, setCreatedRooms] = useState(initialCreatedRooms);
  const [joinedRooms, setJoinedRooms] = useState(initialJoinedRooms);
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  const [roomActionError, setRoomActionError] = useState("");
  const [roomActionLoading, setRoomActionLoading] = useState<"create" | "join" | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(initialKeyStatus);
  const [keyForm, setKeyForm] = useState({
    livekitUrl: "",
    livekitApiKey: "",
    livekitApiSecret: "",
    deepgramApiKey: "",
  });
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState("");

  const [authMode, setAuthMode] = useState<AuthMode | null>(initialAuthMode);
  const [authNextPath, setAuthNextPath] = useState<string | null>(normalizeNextPath(initialNextPath));
  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingRoomAction, setPendingRoomAction] = useState<"create" | "join" | null>(null);

  const isAuthenticated = Boolean(user);
  const hasHistory = createdRooms.length > 0 || joinedRooms.length > 0;
  const authTitle = authMode === "register" ? "注册" : "登录";

  const heroSubtitle = useMemo(() => {
    if (!isAuthenticated) {
      return "一个实时的AI 辩论/吵架 辅助+分析+总结 平台";
    }
    return `你好，${user!.username}。可以直接创建或加入房间。`;
  }, [isAuthenticated, user]);

  function openAuthModal(mode: AuthMode, nextPath?: string | null) {
    setAuthMode(mode);
    setAuthError("");
    if (typeof nextPath !== "undefined") {
      setAuthNextPath(normalizeNextPath(nextPath));
    }
  }

  function clearDataAfterLogout() {
    setUser(null);
    setCreatedRooms([]);
    setJoinedRooms([]);
    setKeyStatus(null);
    setKeyError("");
    setKeyForm({
      livekitUrl: "",
      livekitApiKey: "",
      livekitApiSecret: "",
      deepgramApiKey: "",
    });
  }

  async function requireAuthForRoomAction(action: "create" | "join") {
    if (isAuthenticated) {
      return true;
    }

    setPendingRoomAction(action);
    setRoomActionError("请先登录后再操作。");
    openAuthModal("login");
    return false;
  }

  async function refreshDashboard() {
    if (!isAuthenticated) {
      return;
    }

    setDashboardLoading(true);
    setRoomActionError("");
    try {
      const response = await fetch("/api/rooms/dashboard", { cache: "no-store" });
      const payload = (await response.json()) as DashboardResponse;
      if (!response.ok) {
        if (response.status === 401) {
          clearDataAfterLogout();
          openAuthModal("login");
        }
        throw new Error(payload.error ?? "获取历史房间失败");
      }

      setCreatedRooms(payload.createdRooms);
      setJoinedRooms(payload.joinedRooms);
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : "获取历史房间失败");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function refreshKeyStatus() {
    if (!isAuthenticated) {
      return;
    }

    const response = await fetch("/api/account/keys", { cache: "no-store" });
    const payload = (await response.json()) as KeyStatusResponse;
    if (!response.ok) {
      if (response.status === 401) {
        clearDataAfterLogout();
        openAuthModal("login");
      }
      throw new Error(payload.error ?? "读取 Key 状态失败");
    }
    setKeyStatus(payload.status);
  }

  async function loadAuthenticatedData() {
    const [dashboardResponse, keyResponse] = await Promise.all([
      fetch("/api/rooms/dashboard", { cache: "no-store" }),
      fetch("/api/account/keys", { cache: "no-store" }),
    ]);

    const dashboardPayload = (await dashboardResponse.json()) as DashboardResponse;
    const keyPayload = (await keyResponse.json()) as KeyStatusResponse;

    if (!dashboardResponse.ok) {
      throw new Error(dashboardPayload.error ?? "获取历史房间失败");
    }
    if (!keyResponse.ok) {
      throw new Error(keyPayload.error ?? "读取 Key 状态失败");
    }

    setCreatedRooms(dashboardPayload.createdRooms);
    setJoinedRooms(dashboardPayload.joinedRooms);
    setKeyStatus(keyPayload.status);
  }

  async function bootstrapRoom(action: "create" | "join") {
    if (action === "join" && roomIdToJoin.trim().length === 0) {
      setRoomActionError("请输入房间号。");
      return;
    }

    setRoomActionLoading(action);
    setRoomActionError("");

    try {
      const response = await fetch("/api/rooms/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "create"
            ? JSON.stringify({ action: "create" })
            : JSON.stringify({ action: "join", roomId: roomIdToJoin.trim() }),
      });

      const payload = (await response.json()) as { roomId?: string; error?: string };
      if (!response.ok || !payload.roomId) {
        if (response.status === 401) {
          setPendingRoomAction(action);
          openAuthModal("login");
        }
        throw new Error(payload.error ?? "房间操作失败");
      }

      setPendingRoomAction(null);
      router.push(`/${encodeURIComponent(payload.roomId)}`);
    } catch (error) {
      setRoomActionError(error instanceof Error ? error.message : "房间操作失败");
    } finally {
      setRoomActionLoading(null);
    }
  }

  async function handleCreateRoom() {
    const canContinue = await requireAuthForRoomAction("create");
    if (!canContinue) {
      return;
    }
    await bootstrapRoom("create");
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canContinue = await requireAuthForRoomAction("join");
    if (!canContinue) {
      return;
    }
    await bootstrapRoom("join");
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authMode) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });
      const payload = (await response.json()) as AuthResponse;
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? `${authTitle}失败`);
      }

      setUser(payload.user);
      setAuthMode(null);
      setAuthForm({
        username: "",
        password: "",
      });

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
      setAuthError(error instanceof Error ? error.message : `${authTitle}失败`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearDataAfterLogout();
  }

  async function handleKeySave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }

    setKeyLoading(true);
    setKeyError("");

    try {
      const response = await fetch("/api/account/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyForm),
      });
      const payload = (await response.json()) as KeyStatusResponse;
      if (!response.ok) {
        if (response.status === 401) {
          clearDataAfterLogout();
          openAuthModal("login");
        }
        throw new Error(payload.error ?? "保存 Key 失败");
      }
      setKeyStatus(payload.status);
      setKeyForm({
        livekitUrl: "",
        livekitApiKey: "",
        livekitApiSecret: "",
        deepgramApiKey: "",
      });
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "保存 Key 失败");
    } finally {
      setKeyLoading(false);
    }
  }

  async function handleKeyClear() {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }

    setKeyLoading(true);
    setKeyError("");

    try {
      const response = await fetch("/api/account/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const payload = (await response.json()) as KeyStatusResponse;
      if (!response.ok) {
        if (response.status === 401) {
          clearDataAfterLogout();
          openAuthModal("login");
        }
        throw new Error(payload.error ?? "清空 Key 失败");
      }
      setKeyStatus(payload.status);
      setKeyForm({
        livekitUrl: "",
        livekitApiKey: "",
        livekitApiSecret: "",
        deepgramApiKey: "",
      });
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "清空 Key 失败");
    } finally {
      setKeyLoading(false);
    }
  }

  return (
    <>
      <main className="dashboard-page minimal-page">
        <section className="minimal-shell">
          <header className="minimal-header">
            <div>
              <h1>急了么？</h1>
              <p className="subtitle">{heroSubtitle}</p>
            </div>
            <div className="header-actions">
              {isAuthenticated ? (
                <>
                  <span className="user-chip">{user?.username}</span>
                  <button type="button" className="ghost-btn" onClick={() => void handleLogout()}>
                    退出登录
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setPendingRoomAction(null);
                      openAuthModal("login");
                    }}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setPendingRoomAction(null);
                      openAuthModal("register");
                    }}
                  >
                    注册
                  </button>
                </>
              )}
            </div>
          </header>

          <section className="minimal-main-card">
            <div className="room-quick-actions">
              <button
                type="button"
                className="primary-btn large-btn"
                disabled={roomActionLoading !== null}
                onClick={() => void handleCreateRoom()}
              >
                {roomActionLoading === "create" ? "创建中..." : "创建房间"}
              </button>
              <form className="join-room-form" onSubmit={handleJoinRoom}>
                <input
                  value={roomIdToJoin}
                  onChange={(event) => setRoomIdToJoin(event.target.value)}
                  placeholder="输入已有房间号"
                />
                <button type="submit" className="primary-btn large-btn" disabled={roomActionLoading !== null}>
                  {roomActionLoading === "join" ? "加入中..." : "加入房间"}
                </button>
              </form>
            </div>
            {roomActionError ? <p className="form-error">{roomActionError}</p> : null}
          </section>

          <section className="minimal-details-wrap">
            <details className="minimal-details">
              <summary>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>查看历史房间</span>
                  {isAuthenticated && (
                    <button
                      type="button"
                      title="刷新历史"
                      style={{
                        padding: '4px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: dashboardLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: dashboardLoading ? 0.5 : 1,
                        transition: 'opacity 0.2s, color 0.2s',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!dashboardLoading) void refreshDashboard();
                      }}
                      disabled={dashboardLoading}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                      </svg>
                    </button>
                  )}
                </div>
              </summary>
              {!isAuthenticated ? (
                <div className="details-content">
                  <p className="panel-tip">登录后可查看你创建和参与的房间记录。</p>
                </div>
              ) : (
                <div className="details-content room-history-details">
                  {!hasHistory ? (
                    <p className="panel-tip">暂无历史房间。</p>
                  ) : (
                    <>
                      <div className="history-group">
                        <h3>我创建的房间</h3>
                        {createdRooms.length === 0 ? (
                          <p className="panel-tip">暂无记录。</p>
                        ) : (
                          <ul className="room-list">
                            {createdRooms.map((room) => (
                              <li key={`created-${room.roomId}`} className="room-list-item">
                                <div>
                                  <strong>{room.roomId}</strong>
                                  <p>
                                    状态：{roomStatusLabel(room.status)} | 成员：{room.participantCount} | 消息：
                                    {room.messageCount}
                                  </p>
                                  <p>创建：{formatDate(room.createdAt)}</p>
                                </div>
                                <Link href={`/${encodeURIComponent(room.roomId)}`}>进入</Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="history-group">
                        <h3>我参与的房间</h3>
                        {joinedRooms.length === 0 ? (
                          <p className="panel-tip">暂无记录。</p>
                        ) : (
                          <ul className="room-list">
                            {joinedRooms.map((room) => (
                              <li key={`joined-${room.roomId}`} className="room-list-item">
                                <div>
                                  <strong>{room.roomId}</strong>
                                  <p>
                                    状态：{roomStatusLabel(room.status)} | 成员：{room.participantCount} | 消息：
                                    {room.messageCount}
                                  </p>
                                  <p>最近加入：{formatDate(room.joinedAt ?? room.updatedAt)}</p>
                                </div>
                                <Link href={`/${encodeURIComponent(room.roomId)}`}>进入</Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </details>

            <details className="minimal-details">
              <summary>配置 Provider Key</summary>
              {!isAuthenticated ? (
                <div className="details-content">
                  <p className="panel-tip">登录后可保存个人 LiveKit / Deepgram Key。</p>
                </div>
              ) : (
                <div className="details-content">
                  <p className="panel-tip">
                    当前状态：{keyStatus?.configured ? "已配置" : "未配置"}。仅保存到你的账户，不影响其他用户。
                  </p>
                  <div className="key-status-grid">
                    <span>LiveKit URL：{keyStatus?.livekitUrlMask ?? "未配置"}</span>
                    <span>LiveKit API Key：{keyStatus?.livekitApiKeyMask ?? "未配置"}</span>
                    <span>LiveKit API Secret：{keyStatus?.livekitApiSecretMask ?? "未配置"}</span>
                    <span>Deepgram API Key：{keyStatus?.deepgramApiKeyMask ?? "未配置"}</span>
                  </div>
                  <form className="key-form" onSubmit={handleKeySave}>
                    <input
                      value={keyForm.livekitUrl}
                      onChange={(event) =>
                        setKeyForm((current) => ({ ...current, livekitUrl: event.target.value }))
                      }
                      placeholder="LIVEKIT_URL（可选）"
                    />
                    <input
                      value={keyForm.livekitApiKey}
                      onChange={(event) =>
                        setKeyForm((current) => ({ ...current, livekitApiKey: event.target.value }))
                      }
                      placeholder="LIVEKIT_API_KEY"
                    />
                    <input
                      type="password"
                      value={keyForm.livekitApiSecret}
                      onChange={(event) =>
                        setKeyForm((current) => ({ ...current, livekitApiSecret: event.target.value }))
                      }
                      placeholder="LIVEKIT_API_SECRET"
                    />
                    <input
                      type="password"
                      value={keyForm.deepgramApiKey}
                      onChange={(event) =>
                        setKeyForm((current) => ({ ...current, deepgramApiKey: event.target.value }))
                      }
                      placeholder="DEEPGRAM_API_KEY"
                    />
                    <div className="key-form-actions">
                      <button type="submit" className="primary-btn" disabled={keyLoading}>
                        {keyLoading ? "保存中..." : "保存 Key"}
                      </button>
                      <button type="button" className="ghost-btn" disabled={keyLoading} onClick={() => void handleKeyClear()}>
                        清空
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={keyLoading}
                        onClick={() => void refreshKeyStatus().catch((error) => setKeyError((error as Error).message))}
                      >
                        刷新状态
                      </button>
                    </div>
                  </form>
                  {keyError ? <p className="form-error">{keyError}</p> : null}
                </div>
              )}
            </details>
          </section>
        </section>
      </main>

      {authMode ? (
        <div className="auth-modal-overlay" role="dialog" aria-modal="true">
          <section className="auth-modal">
            <header className="auth-modal-header">
              <h2>{authTitle}</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => {
                  setAuthMode(null);
                  setAuthError("");
                }}
              >
                关闭
              </button>
            </header>

            <div className="auth-switch-row">
              <button
                type="button"
                className={authMode === "login" ? "switch-btn active" : "switch-btn"}
                onClick={() => setAuthMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={authMode === "register" ? "switch-btn active" : "switch-btn"}
                onClick={() => setAuthMode("register")}
              >
                注册
              </button>
            </div>

            {authNextPath ? <p className="panel-tip">登录后将继续访问：{authNextPath}</p> : null}

            <form className="auth-form modal-auth-form" onSubmit={handleAuthSubmit}>
              <label htmlFor="auth-username">用户名</label>
              <input
                id="auth-username"
                value={authForm.username}
                onChange={(event) =>
                  setAuthForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder="3-32 位：小写字母/数字/_"
                autoComplete="username"
              />

              <label htmlFor="auth-password">密码</label>
              <input
                id="auth-password"
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="至少 6 位"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />

              <button type="submit" className="primary-btn" disabled={authLoading}>
                {authLoading ? `${authTitle}中...` : authTitle}
              </button>
            </form>

            {authError ? <p className="form-error">{authError}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
