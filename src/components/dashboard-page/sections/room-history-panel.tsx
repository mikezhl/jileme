import { useMemo, useState } from "react";
import Link from "next/link";

import { RoomIdCopyButton } from "@/components/room-id-copy-button";
import { getRoomDisplayName } from "@/lib/room-name";
import { type UiLanguage } from "@/lib/ui-language";

import {
  formatDate,
  roomStatusLabel,
  type DashboardTranslate,
  type RoomSummary,
} from "../dashboard-page-support";

type RoomHistoryPanelProps = {
  createdRooms: RoomSummary[];
  hasHistory: boolean;
  isAuthenticated: boolean;
  joinedRooms: RoomSummary[];
  language: UiLanguage;
  t: DashboardTranslate;
};

type RoomHistoryItemProps = {
  isOwner: boolean;
  language: UiLanguage;
  room: RoomSummary;
  t: DashboardTranslate;
};

function RoomHistoryItem({ isOwner, language, room, t }: RoomHistoryItemProps) {
  const roomDisplayName = getRoomDisplayName(room.roomName, room.roomId);
  const showRoomCode = Boolean(room.roomName);

  return (
    <li>
      <article className="room-list-item">
        <Link
          className="room-list-item-overlay"
          href={`/${encodeURIComponent(room.roomId)}`}
          aria-label={`${t("进入房间", "Open room")} ${roomDisplayName}${
            showRoomCode ? ` (${room.roomId})` : ""
          }`}
        />
        <div className="room-list-item-copy">
          <div className="room-list-main">
            <div className="room-list-item-head">
              {showRoomCode ? (
                <strong>{roomDisplayName}</strong>
              ) : (
                <RoomIdCopyButton
                  ariaLabel={t(`复制房间号 ${room.roomId}`, `Copy room ID ${room.roomId}`)}
                  className="room-id-copy-button room-list-title-button"
                  copiedLabel={t("复制成功", "Copied")}
                  roomId={room.roomId}
                  title={t("点击复制房间号", "Click to copy room ID")}
                >
                  <strong>{roomDisplayName}</strong>
                </RoomIdCopyButton>
              )}
            </div>

            <div className="room-list-body">
              {showRoomCode ? (
                <p className="room-list-code">
                  <RoomIdCopyButton
                    ariaLabel={t(`复制房间号 ${room.roomId}`, `Copy room ID ${room.roomId}`)}
                    className="room-id-copy-button room-list-code-button"
                    copiedLabel={t("复制成功", "Copied")}
                    roomId={room.roomId}
                    title={t("点击复制房间号", "Click to copy room ID")}
                  >
                    {t("房间代码", "Room code")}: {room.roomId}
                  </RoomIdCopyButton>
                </p>
              ) : null}
              <p>
                {t("成员", "Members")}: {room.participantCount} | {t("消息", "Messages")}:{" "}
                {room.messageCount}
              </p>
              <p>
                {t("最近活跃", "Last active")}: {formatDate(room.updatedAt, language)}
              </p>
            </div>
          </div>
          <div className="room-list-meta-column">
            <span className="room-list-status" data-status={room.status}>
              {roomStatusLabel(room.status, language)}
            </span>
            {isOwner ? (
              <span className="room-list-status room-list-status-public">{t("房主", "Owner")}</span>
            ) : null}
            {room.isPublic ? (
              <span className="room-list-status room-list-status-public">{t("公开", "Public")}</span>
            ) : null}
          </div>
        </div>
      </article>
    </li>
  );
}

const PAGE_SIZE = 10;

export function RoomHistoryPanel({
  createdRooms,
  hasHistory,
  isAuthenticated,
  joinedRooms,
  language,
  t,
}: RoomHistoryPanelProps) {
  const [page, setPage] = useState(1);

  const allRooms = useMemo(() => {
    const createdMap = new Map(createdRooms.map((r) => [r.roomId, r]));
    const combined = [
      ...createdRooms.map((r) => ({ room: r, isOwner: true })),
      ...joinedRooms
        .filter((r) => !createdMap.has(r.roomId))
        .map((r) => ({ room: r, isOwner: false })),
    ];
    return combined.sort(
      (a, b) => new Date(b.room.updatedAt).getTime() - new Date(a.room.updatedAt).getTime()
    );
  }, [createdRooms, joinedRooms]);

  const totalPages = Math.max(1, Math.ceil(allRooms.length / PAGE_SIZE));
  const visibleRooms = allRooms.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="room-history-details">
      {!isAuthenticated ? (
        <p className="panel-tip">
          {t(
            "登录后可查看你参与的房间记录。",
            "Sign in to view rooms you joined.",
          )}
        </p>
      ) : !hasHistory || allRooms.length === 0 ? (
        <p className="panel-tip">{t("暂无历史房间。", "No room history yet.")}</p>
      ) : (
        <>
          <ul className="room-list">
            {visibleRooms.map(({ room, isOwner }) => (
              <RoomHistoryItem
                key={room.roomId}
                isOwner={isOwner}
                language={language}
                room={room}
                t={t}
              />
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="room-list-pagination">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t("上一页", "Previous")}
              </button>
              <span className="room-list-pagination-text">
                {t("第", "Page")} {page} / {totalPages}
              </span>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("下一页", "Next")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
