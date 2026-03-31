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

type PublicRoomPanelProps = {
  language: UiLanguage;
  onPageChange: (page: number) => Promise<void>;
  publicRooms: RoomSummary[];
  publicRoomsError: string;
  publicRoomsLoading: boolean;
  publicRoomsPage: number;
  publicRoomsTotalCount: number;
  publicRoomsTotalPages: number;
  t: DashboardTranslate;
};

type PublicRoomItemProps = {
  language: UiLanguage;
  room: RoomSummary;
  t: DashboardTranslate;
};

function getPublicRoomBadgeLabels(room: RoomSummary, t: DashboardTranslate) {
  const labels: string[] = [];

  if (room.isMine) {
    labels.push(t("我的", "Mine"));
  }
  if (room.isImportedArchive) {
    labels.push(t("外部导入", "Imported"));
  }

  return labels;
}

function PublicRoomItem({ language, room, t }: PublicRoomItemProps) {
  const roomDisplayName = getRoomDisplayName(room.roomName, room.roomId);
  const showRoomCode = Boolean(room.roomName);
  const badgeLabels = getPublicRoomBadgeLabels(room, t);

  return (
    <li>
      <article className="room-list-item">
        <Link
          className="room-list-item-overlay"
          href={`/${encodeURIComponent(room.roomId)}`}
          aria-label={`${t("进入公开房间", "Open public room")} ${roomDisplayName}${
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
                {t("最近活跃", "Updated")}: {formatDate(room.updatedAt, language)}
              </p>
            </div>
          </div>
          <div className="room-list-meta-column">
            <span className="room-list-status" data-status={room.status}>
              {roomStatusLabel(room.status, language)}
            </span>
            {badgeLabels.map((label) => (
              <span key={label} className="room-list-status room-list-status-public">
                {label}
              </span>
            ))}
          </div>
        </div>
      </article>
    </li>
  );
}

export function PublicRoomPanel({
  language,
  onPageChange,
  publicRooms,
  publicRoomsError,
  publicRoomsLoading,
  publicRoomsPage,
  publicRoomsTotalCount,
  publicRoomsTotalPages,
  t,
}: PublicRoomPanelProps) {
  return (
    <details className="minimal-details">
      <summary>
        <div className="room-panel-summary">
          <span>{t("公开房间", "Public Rooms")}</span>
          <span className="room-panel-summary-meta">
            {t(`共 ${publicRoomsTotalCount} 个`, `${publicRoomsTotalCount} total`)}
          </span>
        </div>
      </summary>

      <div className="details-content room-history-details">
        {publicRoomsError ? <p className="form-error">{publicRoomsError}</p> : null}

        {publicRoomsLoading && publicRooms.length === 0 ? (
          <p className="panel-tip">{t("公开房间加载中...", "Loading public rooms...")}</p>
        ) : publicRooms.length === 0 ? (
          <p className="panel-tip">{t("暂无公开房间。", "No public rooms yet.")}</p>
        ) : (
          <>
            <ul className="room-list">
              {publicRooms.map((room) => (
                <PublicRoomItem
                  key={`public-${room.roomId}`}
                  language={language}
                  room={room}
                  t={t}
                />
              ))}
            </ul>

            {publicRoomsTotalPages > 1 ? (
              <div className="room-list-pagination">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void onPageChange(publicRoomsPage - 1)}
                  disabled={publicRoomsLoading || publicRoomsPage <= 1}
                >
                  {t("上一页", "Previous")}
                </button>
                <span className="room-list-pagination-text">
                  {t("第", "Page")} {publicRoomsPage} / {publicRoomsTotalPages}
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void onPageChange(publicRoomsPage + 1)}
                  disabled={publicRoomsLoading || publicRoomsPage >= publicRoomsTotalPages}
                >
                  {t("下一页", "Next")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
