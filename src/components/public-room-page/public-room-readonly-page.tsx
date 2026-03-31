"use client";

import Link from "next/link";
import { useState } from "react";

import { RoomIdCopyButton } from "@/components/room-id-copy-button";
import { getArchiveMessageSide } from "@/lib/archive-room";
import { type ChatMessage } from "@/lib/chat-types";
import { getRoomDisplayName } from "@/lib/room-name";

type PublicRoomReadonlyPageProps = {
  room: {
    roomId: string;
    roomName: string | null;
    sourceUrl: string | null;
    status: "ACTIVE" | "ENDED";
    updatedAt: string;
    endedAt: string | null;
    messageCount: number;
    participantCount: number;
    ownerUsername: string | null;
  };
  messages: ChatMessage[];
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
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

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getRoomStatusLabel(status: PublicRoomReadonlyPageProps["room"]["status"]) {
  return status === "ENDED" ? "已结束" : "进行中";
}

function isSpecialArchivePublicRoom(room: PublicRoomReadonlyPageProps["room"]) {
  return room.status === "ENDED" && room.ownerUsername === "system" && Boolean(room.sourceUrl);
}

function getMessageRowClass(message: ChatMessage) {
  if (message.type === "analysis" || message.type === "summary") {
    return "announcement";
  }

  const archiveSide = getArchiveMessageSide(message.participantId);
  if (archiveSide === "B") {
    return "self";
  }
  if (archiveSide === "other") {
    return "announcement";
  }
  return "other";
}

function getMessageTitle(message: ChatMessage) {
  if (message.type === "analysis") {
    return "AI 分析";
  }
  if (message.type === "summary") {
    return "最终总结";
  }

  return message.senderName || "匿名";
}

function getMessageSourceLabel(message: ChatMessage) {
  switch (message.type) {
    case "transcript":
      return "音";
    case "analysis":
      return "析";
    case "summary":
      return "总";
    default:
      return "文";
  }
}

function parseRealtimeAnalysisMessage(message: ChatMessage) {
  if (message.type !== "analysis") {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("type" in parsed) ||
      parsed.type !== "realtime-analysis"
    ) {
      return null;
    }

    return parsed as {
      insights?: {
        currentRound?: {
          A?: string;
          B?: string;
        };
      };
      roundScores?: {
        A?: {
          delta?: number | string;
          reason?: string;
        } | null;
        B?: {
          delta?: number | string;
          reason?: string;
        } | null;
      };
    };
  } catch {
    return null;
  }
}

function getAnalysisInsight(
  content: ReturnType<typeof parseRealtimeAnalysisMessage>,
  side: "A" | "B",
) {
  const value = content?.insights?.currentRound?.[side];
  return typeof value === "string" ? value : "";
}

function getAnalysisRoundScore(
  content: ReturnType<typeof parseRealtimeAnalysisMessage>,
  side: "A" | "B",
) {
  const value = content?.roundScores?.[side];
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawDelta = value.delta;
  const delta =
    typeof rawDelta === "number"
      ? rawDelta
      : typeof rawDelta === "string" && rawDelta.trim()
        ? Number(rawDelta)
        : Number.NaN;
  const reason = typeof value.reason === "string" ? value.reason : "";

  if (!Number.isFinite(delta) && !reason) {
    return null;
  }

  return {
    delta: Number.isFinite(delta) ? delta : 0,
    reason,
  };
}

function ReadonlyAnalysisMessage({ message }: { message: ChatMessage }) {
  const content = parseRealtimeAnalysisMessage(message);
  if (!content) {
    return (
      <article className="bubble analysis announcement">
        <header className="bubble-meta">
          <strong>{getMessageTitle(message)}</strong>
          <span className="bubble-source">{getMessageSourceLabel(message)}</span>
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
        </header>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.content}
        </p>
      </article>
    );
  }

  const scoreA = getAnalysisRoundScore(content, "A");
  const scoreB = getAnalysisRoundScore(content, "B");
  const insightA = getAnalysisInsight(content, "A");
  const insightB = getAnalysisInsight(content, "B");

  return (
    <article className="bubble analysis announcement">
      <header className="bubble-meta">
        <strong>{getMessageTitle(message)}</strong>
        <span className="bubble-source">{getMessageSourceLabel(message)}</span>
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </header>

      <div className="analysis-grid">
        <div className="analysis-side-section">
          <div className="analysis-side-head">
            <div className="analysis-side-h">A方</div>
            {scoreA ? (
              <span className="analysis-delta-tag">
                {scoreA.delta >= 0 ? "+" : ""}
                {scoreA.delta}
              </span>
            ) : null}
          </div>
          <p className="analysis-insight">{insightA || "本轮无发言"}</p>
          {scoreA?.reason ? (
            <span className="analysis-score-reason">{scoreA.reason}</span>
          ) : null}
        </div>

        <div className="analysis-side-section">
          <div className="analysis-side-head">
            <div className="analysis-side-h">B方</div>
            {scoreB ? (
              <span className="analysis-delta-tag">
                {scoreB.delta >= 0 ? "+" : ""}
                {scoreB.delta}
              </span>
            ) : null}
          </div>
          <p className="analysis-insight">{insightB || "本轮无发言"}</p>
          {scoreB?.reason ? (
            <span className="analysis-score-reason">{scoreB.reason}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ReadonlyArchiveOtherMessage({ message }: { message: ChatMessage }) {
  return (
    <article className="bubble analysis announcement">
      <header className="bubble-meta">
        <strong>{getMessageTitle(message)}</strong>
        <span className="bubble-source">{getMessageSourceLabel(message)}</span>
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </header>
      <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</p>
    </article>
  );
}

export default function PublicRoomReadonlyPage({ room, messages }: PublicRoomReadonlyPageProps) {
  const roomDisplayName = getRoomDisplayName(room.roomName, room.roomId);
  const nextPath = `/${encodeURIComponent(room.roomId)}`;
  const loginHref = `/?auth=login&next=${encodeURIComponent(nextPath)}`;
  const hasEnded = room.status === "ENDED";
  const hideAnonymousReadonlyNotice = isSpecialArchivePublicRoom(room);
  const [isMobileHeaderCollapsed, setIsMobileHeaderCollapsed] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const mobileHeaderToggleLabel = isMobileHeaderCollapsed ? "展开头部" : "收起头部";
  const sidebarContent = (
    <>
      <div className="sidebar-section">
        <h4>房间信息</h4>
        <div className="key-status-grid">
          <span>状态：{getRoomStatusLabel(room.status)}</span>
          <span>可见性：公开</span>
          <span>房主：{room.ownerUsername ? `@${room.ownerUsername}` : "未知"}</span>
          <span>成员：{room.participantCount}</span>
          <span>消息：{room.messageCount}</span>
          {room.sourceUrl ? (
            <span>
              来源：
              <a href={room.sourceUrl} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
                {room.sourceUrl}
              </a>
            </span>
          ) : null}
          <span>最近更新：{formatDateTime(room.updatedAt)}</span>
          {room.endedAt ? <span>结束时间：{formatDateTime(room.endedAt)}</span> : null}
        </div>
      </div>

      <div className="sidebar-section">
        <h4>访问限制</h4>
        <div className="overall-insight-box">
          <p className="analysis-insight" style={{ margin: 0, fontSize: "0.9rem" }}>
            匿名用户仅查看当前已保存的历史消息。
          </p>
          <p className="analysis-insight" style={{ margin: 0, fontSize: "0.9rem" }}>
            不接入 LiveKit、语音转录、实时分析、轮询更新或发言能力。
          </p>
        </div>
      </div>
    </>
  );

  return (
    <main className="room-page">
      <section className="room-shell room-shell-chat">
        <header className={`room-header room-header-collapsible${isMobileHeaderCollapsed ? " is-mobile-collapsed" : ""}`}>
          <div className="room-header-mobile-bar">
            <button
              type="button"
              className="room-header-mobile-bar-title room-header-mobile-bar-title-button"
              title={roomDisplayName}
              onClick={() => setIsMobileHeaderCollapsed(false)}
            >
              {roomDisplayName}
            </button>
            <div className="room-header-mobile-bar-controls">
              <button
                type="button"
                className="ghost-btn room-mobile-action-btn room-header-mobile-details-btn"
                onClick={() => setShowMobileDetails(true)}
              >
                详情
              </button>
              <button
                type="button"
                className="back-icon-btn room-header-collapse-toggle room-header-collapse-toggle-inline"
                aria-expanded={!isMobileHeaderCollapsed}
                aria-label={mobileHeaderToggleLabel}
                title={mobileHeaderToggleLabel}
                onClick={() => setIsMobileHeaderCollapsed(false)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="room-header-title">
            <div className="room-header-title-row">
              <h1>{roomDisplayName}</h1>

              <div className="room-header-statuses">
                <span className="room-list-status" data-status={room.status}>
                  {getRoomStatusLabel(room.status)}
                </span>
                <span className="room-list-status room-list-status-public">公开只读</span>
              </div>
            </div>

            <div className="room-meta-row room-meta-row-wrapped">
              <RoomIdCopyButton
                ariaLabel={`复制房间号 ${room.roomId}`}
                className="room-id-copy-button room-header-code room-meta-row-anchor"
                copiedLabel="复制成功"
                roomId={room.roomId}
                title="点击复制房间号"
              >
                {room.roomId}
              </RoomIdCopyButton>
              <span className="room-meta-divider" aria-hidden="true">
                |
              </span>
              <span>{room.participantCount} 人</span>
              <span className="room-meta-divider" aria-hidden="true">
                |
              </span>
              <span>{room.messageCount} 条消息</span>
              <span className="room-meta-divider" aria-hidden="true">
                |
              </span>
              <span>更新于 {formatDateTime(room.updatedAt)}</span>
            </div>
          </div>

          <Link className="room-back-link" href="/" title="返回首页">
            <span className="ghost-btn room-header-short-action" style={{ height: "40px" }}>
              返回
            </span>
          </Link>

          <div className="room-actions">
            <Link
              className="ghost-btn mobile-only-flex room-mobile-action-btn room-mobile-secondary-action"
              href="/"
              title="返回首页"
            >
              返回
            </Link>
            <button
              type="button"
              className="ghost-btn mobile-only-flex room-mobile-action-btn room-mobile-secondary-action"
              onClick={() => setShowMobileDetails(true)}
            >
              详情
            </button>
            <Link className="primary-btn desktop-only" href={loginHref} style={{ height: "40px" }}>
              登录后参与
            </Link>
          </div>

          <button
            type="button"
            className="back-icon-btn room-header-collapse-toggle"
            aria-expanded={!isMobileHeaderCollapsed}
            aria-label={mobileHeaderToggleLabel}
            title={mobileHeaderToggleLabel}
            onClick={() => setIsMobileHeaderCollapsed((current) => !current)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={isMobileHeaderCollapsed ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} />
            </svg>
          </button>
        </header>

        {hideAnonymousReadonlyNotice ? null : (
          <div
            className="key-status-grid"
            style={{
              width: "calc(100% - 48px)",
              maxWidth: "800px",
              margin: "0 auto 16px",
            }}
          >
            <strong>当前为匿名只读浏览</strong>
            <span>不会建立实时连接，不会加入通信，也不会调用房间运行时接口。</span>
            <span>{hasEnded ? "房间已结束，仅保留历史内容查看。" : "如需发言、上麦或参与实时对话，请先登录。"}</span>
          </div>
        )}

        <section className="chat-panel">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <p className="empty-chat">暂无对话内容。</p>
            ) : (
              messages.map((message) => {
                const isAnnouncement =
                  message.type === "analysis" || message.type === "summary";

                return (
                  <div
                    key={message.id}
                    className={`message-row ${getMessageRowClass(message)}`}
                  >
                    {message.type === "analysis" ? (
                      <ReadonlyAnalysisMessage message={message} />
                    ) : getArchiveMessageSide(message.participantId) === "other" ? (
                      <ReadonlyArchiveOtherMessage message={message} />
                    ) : (
                      <article
                        className={`bubble ${message.type} ${
                          isAnnouncement ? "announcement" : getMessageRowClass(message)
                        }`}
                      >
                        <header className="bubble-meta">
                          <strong>{getMessageTitle(message)}</strong>
                          <span className="bubble-source">{getMessageSourceLabel(message)}</span>
                          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                        </header>
                        <p
                          style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {message.content}
                        </p>
                      </article>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <div className="chat-form room-chat-form">
          <textarea
            rows={1}
            readOnly
            value=""
            placeholder="匿名只读模式，登录后可参与对话"
            disabled
            style={{ overflow: "hidden" }}
          />
          <div className="room-chat-controls">
            <Link className="primary-btn" href={loginHref}>
              登录后参与
            </Link>
          </div>
        </div>
      </section>

      <aside className="room-sidebar">{sidebarContent}</aside>

      <div
        className={`mobile-analysis-overlay ${showMobileDetails ? "active" : ""}`}
        onClick={() => setShowMobileDetails(false)}
      />
      <div className={`mobile-analysis-drawer ${showMobileDetails ? "active" : ""}`}>
        <button className="drawer-close-btn" onClick={() => setShowMobileDetails(false)} type="button">
          ×
        </button>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800 }}>房间详情</h2>
        {sidebarContent}
      </div>
    </main>
  );
}
