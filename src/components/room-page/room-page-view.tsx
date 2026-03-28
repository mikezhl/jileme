import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { RoomIdCopyButton } from "@/components/room-id-copy-button";
import { type TranscriptionProviderName } from "@/features/transcription/core/providers";
import { getArchiveMessageSide } from "@/lib/archive-room";
import { type RoomAnalysisProfilePreference } from "@/lib/room-analysis-profile";
import { type RoomTranscriptionLanguagePreference } from "@/lib/room-transcription-language";
import { type RoomVoiceSourcePreference } from "@/lib/room-voice-preferences";
import { type RoomSpeakerMode } from "@/lib/room-speaker";
import { type ChatMessage } from "@/lib/chat-types";
import { type UiLanguage } from "@/lib/ui-language";

import {
  formatTime,
  formatAnalysisProfileValue,
  formatVoiceSourceValue,
  formatVoiceTranscriptionValue,
  formatVoiceTransportValue,
  getAnalysisInsight,
  getAnalysisProviderDetails,
  getAnalysisProviderLabel,
  getAnalysisRoundScore,
  getVoiceProviderSummary,
  isOwnMessage,
  parseRealtimeAnalysisMessage,
  type ActiveStatusTooltipState,
  type AnalysisViewState,
  type RoomConnectionState,
  type RoomMetaState,
  type RoomPageTranslate,
  type TranscriptionState,
} from "./room-page-support";

type RoomPageViewProps = {
  activeStatusTooltip: ActiveStatusTooltipState;
  analysisProfilePending: boolean;
  analysisTogglePending: boolean;
  analysisViewState: AnalysisViewState;
  audioContainerRef: RefObject<HTMLDivElement | null>;
  callButtonClassName: string;
  canConnectRoom: boolean;
  canLeaveVoiceCall: boolean;
  canParticipate: boolean;
  chatInput: string;
  chatInputRef: RefObject<HTMLTextAreaElement | null>;
  connectionState: RoomConnectionState;
  endingRoom: boolean;
  isAudienceReadOnly: boolean;
  isCreator: boolean;
  isEnded: boolean;
  isInitialConnectionPending: boolean;
  isZh: boolean;
  language: UiLanguage;
  messages: ChatMessage[];
  micDevices: MediaDeviceInfo[];
  micEnabled: boolean;
  micSelectorOpen: boolean;
  micVolume: number;
  onChatInputChange: (value: string) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCloseEndRoomConfirm: () => void;
  onCloseMicSelector: () => void;
  onCloseMobileAnalysis: () => void;
  onCloseSwitchConfirm: () => void;
  onConfirmEndRoom: () => void;
  onConfirmSwitch: () => void;
  onConnectRoom: () => void;
  onCloseActiveStatusTooltip: () => void;
  onConnectionStatusClick: () => void;
  onLeaveVoiceCall: () => void;
  onOpenEndRoomConfirm: () => void;
  onOpenMobileAnalysis: () => void;
  onSelectMic: (deviceId: string) => void;
  onSpeakerSwitchAction: () => void;
  onStartVoiceCall: () => void;
  onSubmitTextMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleMicSelector: () => void;
  onTogglePublicRoom: () => void;
  onToggleRawMessage: (nextId: string | null) => void;
  onToggleRealtimeAnalysis: () => void;
  onUpdateAnalysisProfile: (profile: RoomAnalysisProfilePreference) => void;
  onUpdateRoomTranscriptionLanguage: (language: RoomTranscriptionLanguagePreference) => void;
  onUpdateVoiceSource: (source: RoomVoiceSourcePreference) => void;
  onUpdateVoiceTranscriptionProvider: (provider: TranscriptionProviderName) => void;
  onTranscriptionStatusClick: () => void;
  overallInsights: {
    own: string;
    other: string;
  };
  rawMessageId: string | null;
  roomConnectionStatusClass: string;
  roomDisplayName: string;
  roomError: string;
  roomId: string;
  roomInteractionBlocked: boolean;
  roomMeta: RoomMetaState;
  publicTogglePending: boolean;
  scores: {
    own: number;
    other: number;
  };
  scrollAnchorRef: RefObject<HTMLDivElement | null>;
  selectedMicId: string;
  sendingText: boolean;
  showEndRoomConfirm: boolean;
  showMobileAnalysis: boolean;
  showSwitchConfirm: boolean;
  speakerMode: RoomSpeakerMode;
  speakerSwitchEnabled: boolean;
  speakerSwitchPending: boolean;
  startingCallButtonLabel: string;
  suggestions: {
    own: string[];
    other: string[];
  };
  t: RoomPageTranslate;
  transcriptionState: TranscriptionState;
  userId: string;
  username: string;
  voiceCallStarting: boolean;
  voiceSettingsPending: boolean;
};

type AnalysisMessageProps = {
  analysisViewState: AnalysisViewState;
  language: UiLanguage;
  message: ChatMessage;
  onToggleRawMessage: (nextId: string | null) => void;
  rawMessageId: string | null;
  t: RoomPageTranslate;
};

function AnalysisMessage({
  analysisViewState,
  language,
  message,
  onToggleRawMessage,
  rawMessageId,
  t,
}: AnalysisMessageProps) {
  try {
    const analysisView = analysisViewState.messageViews.get(message.id);
    const data = analysisView?.content ?? parseRealtimeAnalysisMessage(message);
    if (!data) {
      throw new Error("Not realtime");
    }

    const isRaw = rawMessageId === message.id;
    const ownSourceLabel = analysisView ? analysisView.ownSourceLabel : "A";
    const otherSourceLabel = analysisView ? analysisView.otherSourceLabel : "B";
    const otherRoundScore = getAnalysisRoundScore(data, otherSourceLabel);
    const ownRoundScore = getAnalysisRoundScore(data, ownSourceLabel);
    const otherCurrentRoundInsight = getAnalysisInsight(data, "currentRound", otherSourceLabel);
    const ownCurrentRoundInsight = getAnalysisInsight(data, "currentRound", ownSourceLabel);

    return (
      <div className="bubble analysis">
        {isRaw ? (
          <pre
            style={
              {
                fontSize: "0.75rem",
                overflowX: "auto",
                background: "rgba(0,0,0,0.03)",
                padding: "10px",
                borderRadius: "8px",
                color: "#000",
              } satisfies CSSProperties
            }
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <div className="analysis-grid">
            <div className="analysis-side-section">
              <div className="analysis-side-head">
                <div className="analysis-side-h">{t("对方", "Other Side")}</div>
                {otherRoundScore && (
                  <span className="analysis-delta-tag">
                    {otherRoundScore.delta >= 0 ? "+" : ""}
                    {otherRoundScore.delta}
                  </span>
                )}
              </div>
              <p className="analysis-insight">
                {otherCurrentRoundInsight || t("本轮无发言", "No activity this round")}
              </p>
              {otherRoundScore?.reason && (
                <span className="analysis-score-reason">{otherRoundScore.reason}</span>
              )}
            </div>

            <div className="analysis-side-section">
              <div className="analysis-side-head">
                <div className="analysis-side-h">{t("我方", "Our Side")}</div>
                {ownRoundScore && (
                  <span className="analysis-delta-tag">
                    {ownRoundScore.delta >= 0 ? "+" : ""}
                    {ownRoundScore.delta}
                  </span>
                )}
              </div>
              <p className="analysis-insight">
                {ownCurrentRoundInsight || t("本轮无发言", "No activity this round")}
              </p>
              {ownRoundScore?.reason && (
                <span className="analysis-score-reason">{ownRoundScore.reason}</span>
              )}
            </div>
          </div>
        )}

        <button
          className="raw-toggle"
          onClick={() => onToggleRawMessage(isRaw ? null : message.id)}
          type="button"
        >
          {isRaw ? t("查看精简版", "Minimal") : t("查看原文", "Raw JSON")}
        </button>
      </div>
    );
  } catch {
    return (
      <div className="bubble analysis">
        <header className="bubble-meta">
          <strong>{t("AI 分析", "AI Analysis")}</strong>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt, language)}</time>
        </header>
        <p>{message.content}</p>
      </div>
    );
  }
}

function ArchiveOtherMessage({
  language,
  message,
  t,
}: Pick<RoomPageViewProps, "language" | "t"> & { message: ChatMessage }) {
  return (
    <article className="bubble analysis announcement">
      <header className="bubble-meta">
        <strong>{message.senderName || t("其它", "Other")}</strong>
        <span className="bubble-source">{message.type === "transcript" ? t("音", "V") : t("文", "T")}</span>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt, language)}</time>
      </header>
      <p>{message.content}</p>
    </article>
  );
}

function getRoomMemberRoleLabel(
  member: RoomMetaState["members"][number],
  t: RoomPageTranslate,
) {
  if (member.isOwner) {
    if (member.debateSlot === "A") {
      return t("房主·辩手A", "Host Debater A");
    }
    if (member.debateSlot === "B") {
      return t("房主·辩手B", "Host Debater B");
    }
    return t("房主", "Host");
  }

  if (member.debateSlot === "A") {
    return t("辩手A", "Debater A");
  }
  if (member.debateSlot === "B") {
    return t("辩手B", "Debater B");
  }

  return t("旁听", "Observer");
}

function getRoomMemberStatusLabel(
  member: RoomMetaState["members"][number],
  t: RoomPageTranslate,
) {
  return member.isOnline ? t("在线", "Online") : t("离线", "Offline");
}

function isSpecialArchiveRoomMeta(roomMeta: RoomMetaState) {
  const ownerMember = roomMeta.members.find((member) => member.isOwner);
  return (
    roomMeta.status === "ENDED" &&
    roomMeta.isPublic &&
    Boolean(roomMeta.sourceUrl) &&
    ownerMember?.username === "system"
  );
}

function RoomMembersSummary({
  roomMeta,
  t,
}: Pick<RoomPageViewProps, "roomMeta" | "t">) {
  const [showMobileMembers, setShowMobileMembers] = useState(false);
  const [mobileMembersFlyoutShift, setMobileMembersFlyoutShift] = useState(0);
  const mobileMembersRef = useRef<HTMLDivElement | null>(null);
  const mobileMembersFlyoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showMobileMembers) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (mobileMembersRef.current?.contains(target)) {
        return;
      }

      setMobileMembersFlyoutShift(0);
      setShowMobileMembers(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMembersFlyoutShift(0);
        setShowMobileMembers(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMobileMembers]);

  useEffect(() => {
    if (!showMobileMembers) {
      return;
    }

    const viewportPadding = 14;
    let frameId = 0;

    const updateFlyoutPosition = () => {
      const flyoutElement = mobileMembersFlyoutRef.current;
      if (!flyoutElement) {
        return;
      }

      const rect = flyoutElement.getBoundingClientRect();
      let nextShift = 0;

      if (rect.left < viewportPadding) {
        nextShift += viewportPadding - rect.left;
      }

      if (rect.right > window.innerWidth - viewportPadding) {
        nextShift -= rect.right - (window.innerWidth - viewportPadding);
      }

      setMobileMembersFlyoutShift((current) =>
        Math.abs(current - nextShift) < 1 ? current : nextShift,
      );
    };

    frameId = window.requestAnimationFrame(updateFlyoutPosition);
    window.addEventListener("resize", updateFlyoutPosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateFlyoutPosition);
    };
  }, [showMobileMembers, roomMeta.members.length]);

  if (roomMeta.members.length === 0) {
    return null;
  }

  const ownerMember = roomMeta.members.find((member) => member.isOwner) ?? roomMeta.members[0];
  const ownerStatusLabel = getRoomMemberStatusLabel(ownerMember, t);
  const isSpecialArchiveRoom = isSpecialArchiveRoomMeta(roomMeta);
  const mobileMembersPanelId = "room-members-mobile-panel";
  const mobileMembersFlyoutStyle =
    mobileMembersFlyoutShift === 0
      ? undefined
      : ({ transform: `translateX(${mobileMembersFlyoutShift}px)` } satisfies CSSProperties);

  return (
    <>
      <span className="room-meta-divider room-members-desktop" aria-hidden="true">
        |
      </span>
      <div className="room-members-inline room-members-desktop" aria-label={t("房间成员", "Room members")}>
        {roomMeta.members.map((member) => {
          const roleLabel = getRoomMemberRoleLabel(member, t);
          const statusLabel = getRoomMemberStatusLabel(member, t);
          const titleLabel = isSpecialArchiveRoom
            ? `@${member.username} | ${statusLabel}`
            : `${roleLabel} | @${member.username} | ${statusLabel}`;

          return (
            <span
              key={member.userId}
              className={`room-member-inline ${member.isOnline ? "online" : "offline"}`}
              title={titleLabel}
            >
              {isSpecialArchiveRoom ? null : <span className="room-member-inline-role">{roleLabel}</span>}
              <span className="room-member-inline-name">@{member.username}</span>
              <span
                className={`room-member-inline-status ${member.isOnline ? "online" : "offline"}`}
                aria-label={statusLabel}
              >
                <span className="room-member-inline-dot" aria-hidden="true" />
              </span>
            </span>
          );
        })}
      </div>
      <span className="room-meta-divider room-members-mobile" aria-hidden="true">
        |
      </span>
      <div ref={mobileMembersRef} className="room-members-mobile-wrap">
        <span
          className={`room-members-mobile-owner ${ownerMember.isOnline ? "online" : "offline"}`}
          title={`${ownerMember.username} | ${ownerStatusLabel}`}
        >
          <span className="room-members-mobile-owner-name">{ownerMember.username}</span>
          <span
            className={`room-member-inline-status ${ownerMember.isOnline ? "online" : "offline"}`}
            aria-label={ownerStatusLabel}
          >
            <span className="room-member-inline-dot" aria-hidden="true" />
          </span>
        </span>

        {roomMeta.members.length > 1 ? (
          <button
            type="button"
            className="room-members-mobile-trigger"
            aria-controls={mobileMembersPanelId}
            aria-expanded={showMobileMembers}
            aria-haspopup="dialog"
            onClick={() => {
              if (showMobileMembers) {
                setMobileMembersFlyoutShift(0);
                setShowMobileMembers(false);
                return;
              }

              setShowMobileMembers(true);
            }}
          >
            {t("查看列表", "View list")}
          </button>
        ) : null}
        {showMobileMembers ? (
          <div
            id={mobileMembersPanelId}
            ref={mobileMembersFlyoutRef}
            className="room-members-flyout"
            role="dialog"
            aria-modal="false"
            aria-label={t("房间成员", "Room members")}
            style={mobileMembersFlyoutStyle}
          >
            <div className="room-members-flyout-panel">
              <div className="room-members-flyout-head">
                <span className="room-members-flyout-title">
                  {t("房间成员", "Room members")}
                </span>
                {isSpecialArchiveRoom ? null : (
                  <p className="room-members-flyout-hint">
                    {t(
                      "前两位进入的成员为辩手A / 辩手B，其余成员旁听只读。",
                      "The first two members become Debater A and Debater B. Everyone after that is read-only.",
                    )}
                  </p>
                )}
              </div>

              <div className="room-members-flyout-list">
                {roomMeta.members.map((member) => {
                  const roleLabel = getRoomMemberRoleLabel(member, t);
                  const statusLabel = getRoomMemberStatusLabel(member, t);
                  const titleLabel = isSpecialArchiveRoom
                    ? `@${member.username} | ${statusLabel}`
                    : `${roleLabel} | @${member.username} | ${statusLabel}`;

                  return (
                    <div key={`mobile-${member.userId}`} className="room-members-flyout-row">
                      <span
                        className={`room-member-inline ${member.isOnline ? "online" : "offline"}`}
                        title={titleLabel}
                      >
                        {isSpecialArchiveRoom ? null : <span className="room-member-inline-role">{roleLabel}</span>}
                        <span className="room-member-inline-name">@{member.username}</span>
                        <span
                          className={`room-member-inline-status ${member.isOnline ? "online" : "offline"}`}
                          aria-label={statusLabel}
                        >
                          <span className="room-member-inline-dot" aria-hidden="true" />
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

type PopoverInlineMenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function PopoverInlineMenu({
  ariaLabel,
  displayValue,
  disabled,
  isOpen,
  onChange,
  onOpenChange,
  onOwnerOnlySettingAttempt,
  ownerOnlyMessage,
  ownerLocked = false,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  displayValue?: string;
  disabled: boolean;
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onOwnerOnlySettingAttempt?: () => void;
  ownerOnlyMessage?: string;
  ownerLocked?: boolean;
  options: PopoverInlineMenuOption[];
  placeholder: string;
  value: string;
}) {
  const selectedOption = options.find((option) => option.value === value);
  const triggerLocked = ownerLocked && !disabled;

  return (
    <span className={`provider-popover-control ${isOpen ? "active" : ""} ${triggerLocked ? "locked" : ""}`}>
      <button
        type="button"
        className="provider-popover-trigger"
        aria-haspopup="listbox"
        aria-expanded={triggerLocked ? false : isOpen}
        aria-disabled={disabled || triggerLocked}
        aria-label={ariaLabel}
        disabled={disabled}
        title={triggerLocked ? ownerOnlyMessage : undefined}
        onClick={() => {
          if (disabled) {
            return;
          }
          if (triggerLocked) {
            onOwnerOnlySettingAttempt?.();
            return;
          }
          onOpenChange(!isOpen);
        }}
      >
        <span className="provider-popover-trigger-value">
          {displayValue ?? selectedOption?.label ?? placeholder}
        </span>
      </button>

      {isOpen && !triggerLocked ? (
        <div className="provider-popover-menu" role="listbox" aria-label={ariaLabel}>
          <div className="provider-popover-menu-list">
            {options.map((option) => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`provider-popover-menu-item ${isActive ? "active" : ""}`}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled || isActive) {
                      onOpenChange(false);
                      return;
                    }
                    onChange(option.value);
                    onOpenChange(false);
                  }}
                >
                  <span className="provider-popover-menu-item-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </span>
  );
}

function getRoomTranscriptionLanguageLabel(
  value: RoomTranscriptionLanguagePreference,
  t: RoomPageTranslate,
) {
  if (value === "en") {
    return t("英文", "English");
  }
  return t("中文", "Chinese");
}

function RoomTranscriptionLanguageControl({
  onOwnerOnlySettingAttempt,
  onUpdateRoomTranscriptionLanguage,
  roomMeta,
  showOwnerOnlyHint,
  t,
  voiceSettingsPending,
}: Pick<
  RoomPageViewProps,
  | "onUpdateRoomTranscriptionLanguage"
  | "roomMeta"
  | "t"
  | "voiceSettingsPending"
> & {
  onOwnerOnlySettingAttempt: () => void;
  showOwnerOnlyHint: boolean;
}) {
  const ownerOnlyMessage = t("仅房主才能设置这些选项。", "Only the room owner can change these settings.");
  const isOwner = roomMeta.isCreator;
  const selectedLanguage = roomMeta.providers.voice.selection.selectedTranscriptionLanguage;
  const controlsDisabled = voiceSettingsPending || roomMeta.status === "ENDED";
  const options = ([
    "zh",
    "en",
  ] as const).map((value) => ({
    value,
    label: getRoomTranscriptionLanguageLabel(value, t),
  }));
  const selectedIndex = options.findIndex((option) => option.value === selectedLanguage);
  const sliderIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const sliderStyle: CSSProperties = {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    alignItems: "center",
    width: "100%",
    minWidth: "100%",
    minHeight: "32px",
    marginTop: "1px",
    padding: "2px",
    border: "1px solid var(--line)",
    borderRadius: "12px",
    background: "var(--surface)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
    overflow: "hidden",
  };
  const sliderThumbStyle: CSSProperties = {
    position: "absolute",
    top: "2px",
    left: "2px",
    width: "calc((100% - 4px) / 2)",
    height: "calc(100% - 4px)",
    borderRadius: "10px",
    background: "var(--foreground)",
    boxShadow: "0 8px 18px -14px rgba(15,23,42,0.4), 0 2px 6px rgba(15,23,42,0.16)",
    transform: `translateX(${sliderIndex * 100}%)`,
    transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
  };
  const sliderLabelStyle: CSSProperties = {
    display: "block",
    width: "100%",
    fontSize: "0.72rem",
    fontWeight: 700,
    lineHeight: 1,
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <div className="owner-only-tip-anchor">
      {showOwnerOnlyHint ? <div className="owner-only-tip">{ownerOnlyMessage}</div> : null}
      <div className="room-status provider-chip provider-chip-panel visibility-chip-panel">
        <div className="provider-chip-main" style={{ width: "100%" }}>
          <span className="provider-chip-label">{t("语言", "Language")}</span>
          <div
            className={`room-transcription-language-slider ${!isOwner ? "locked" : ""}`}
            role="radiogroup"
            aria-label={t("选择语言", "Select language")}
            aria-disabled={controlsDisabled || !isOwner}
            title={!isOwner ? ownerOnlyMessage : undefined}
            style={sliderStyle}
          >
            <span className="room-transcription-language-slider-thumb" aria-hidden="true" style={sliderThumbStyle} />
            {options.map((option) => {
              const isActive = option.value === selectedLanguage;
              const optionStyle: CSSProperties = {
                position: "relative",
                zIndex: 1,
                minWidth: 0,
                minHeight: "28px",
                padding: "0 6px",
                border: "none",
                borderRadius: "10px",
                background: "transparent",
                color: isActive ? "var(--background)" : "var(--foreground)",
                opacity: controlsDisabled ? 0.55 : 1,
                cursor: controlsDisabled || !isOwner ? "not-allowed" : "pointer",
              };
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={option.label}
                  className={`room-transcription-language-slider-option ${isActive ? "active" : ""}`}
                  disabled={controlsDisabled}
                  style={optionStyle}
                  onClick={() => {
                    if (controlsDisabled) {
                      return;
                    }
                    if (!isOwner) {
                      onOwnerOnlySettingAttempt();
                      return;
                    }
                    if (option.value === selectedLanguage) {
                      return;
                    }
                    onUpdateRoomTranscriptionLanguage(option.value);
                  }}
                >
                  <span className="room-transcription-language-slider-label" style={sliderLabelStyle}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceProviderPopover({
  language,
  onUpdateVoiceSource,
  onUpdateVoiceTranscriptionProvider,
  onOwnerOnlySettingAttempt,
  roomMeta,
  showOwnerOnlyHint,
  t,
  voiceSettingsPending,
}: Pick<
  RoomPageViewProps,
  | "language"
  | "onUpdateVoiceSource"
  | "onUpdateVoiceTranscriptionProvider"
  | "roomMeta"
  | "t"
  | "voiceSettingsPending"
> & {
  onOwnerOnlySettingAttempt: () => void;
  showOwnerOnlyHint: boolean;
}) {
  const [openMenu, setOpenMenu] = useState<"source" | "transcription" | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const voice = roomMeta.providers.voice;
  const isOwner = roomMeta.isCreator;
  const ownerOnlyMessage = t("仅房主才能设置这些选项。", "Only the room owner can change these settings.");
  const sourceValue = voice.selection.selectedSource ?? "";
  const transcriptionValue = voice.selection.selectedTranscriptionProvider ?? "";
  const sourceDisplayValue = formatVoiceSourceValue(
    voice.selection.selectedSource ?? voice.transport.source,
    language,
  );
  const transcriptionDisplayValue = formatVoiceTranscriptionValue(voice, language);
  const availableSourceCount = voice.selection.sourceOptions.filter((option) => option.available).length;
  const availableTranscriptionCount = voice.selection.transcriptionOptions.filter(
    (option) => option.available,
  ).length;
  const canSelectSource =
    isOwner &&
    (availableSourceCount > 1 ||
      Boolean(
        voice.selection.selectedSource &&
          voice.selection.sourceOptions.some(
            (option) => option.value === voice.selection.selectedSource && !option.available,
          ),
      ));
  const canSelectTranscription =
    isOwner &&
    voice.transcriberEnabled &&
    (availableTranscriptionCount > 1 ||
      Boolean(
        voice.selection.selectedTranscriptionProvider &&
          voice.selection.transcriptionOptions.some(
            (option) =>
              option.value === voice.selection.selectedTranscriptionProvider && !option.available,
          ),
      ));
  const showLockedSourceControl = !isOwner;
  const showLockedTranscriptionControl = !isOwner;
  const controlsDisabled = voiceSettingsPending || roomMeta.status === "ENDED";
  const sourceOptions: PopoverInlineMenuOption[] = voice.selection.sourceOptions.map((option) => ({
    value: option.value,
    label: formatVoiceSourceValue(option.value, language),
    disabled: !option.available,
  }));
  const transcriptionOptions: PopoverInlineMenuOption[] = voice.selection.transcriptionOptions.map((option) => ({
    value: option.value,
    label: option.value === "deepgram" ? "Deepgram" : "DashScope",
    disabled: !option.available,
  }));

  useEffect(() => {
    if (openMenu === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (popoverRef.current?.contains(target)) {
        return;
      }

      setOpenMenu(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  return (
    <div className="provider-tooltip">
      {showOwnerOnlyHint ? <div className="owner-only-tip">{ownerOnlyMessage}</div> : null}
      <div className="room-status provider-chip provider-chip-panel" tabIndex={0}>
        <div className="provider-chip-main">
          <span className="provider-chip-label">{t("语音与转录", "Voice & Transcription")}</span>
          <strong
            className="provider-chip-value provider-chip-value-voice"
            title={getVoiceProviderSummary(voice, language)}
          >
            {getVoiceProviderSummary(voice, language)}
          </strong>
        </div>
      </div>
      <div ref={popoverRef} className="provider-popover provider-popover-form" role="tooltip">
        <div className="provider-popover-title">{t("语音与转录", "Voice & Transcription")}</div>

        <div className="provider-popover-row provider-popover-row-control">
          <span className="provider-popover-label">
            {t("语音与转录来源", "Voice & transcription source")}
          </span>
          {canSelectSource || showLockedSourceControl ? (
            <PopoverInlineMenu
              ariaLabel={t("选择语音与转录来源", "Select voice and transcription source")}
              displayValue={sourceDisplayValue}
              disabled={controlsDisabled}
              isOpen={openMenu === "source"}
              onOwnerOnlySettingAttempt={onOwnerOnlySettingAttempt}
              ownerOnlyMessage={ownerOnlyMessage}
              ownerLocked={!isOwner}
              options={sourceOptions}
              placeholder={t("未设置", "Not set")}
              value={sourceValue}
              onChange={(nextValue) => {
                const typedValue = nextValue as RoomVoiceSourcePreference;
                if (!typedValue || typedValue === voice.selection.selectedSource) {
                  return;
                }
                onUpdateVoiceSource(typedValue);
              }}
              onOpenChange={(nextOpen) => setOpenMenu(nextOpen ? "source" : null)}
            />
          ) : (
            <strong className="provider-popover-value">{sourceDisplayValue}</strong>
          )}
        </div>

        <div className="provider-popover-row">
          <span className="provider-popover-label">{t("语音通道", "Voice transport")}</span>
          <strong className="provider-popover-value">
            {formatVoiceTransportValue(voice, language)}
          </strong>
        </div>

        <div className="provider-popover-row provider-popover-row-control">
          <span className="provider-popover-label">{t("转录通道", "Transcription channel")}</span>
          {canSelectTranscription || showLockedTranscriptionControl ? (
            <PopoverInlineMenu
              ariaLabel={t("选择转录通道", "Select transcription channel")}
              displayValue={transcriptionDisplayValue}
              disabled={controlsDisabled || (isOwner && !voice.selection.selectedSource)}
              isOpen={openMenu === "transcription"}
              onOwnerOnlySettingAttempt={onOwnerOnlySettingAttempt}
              ownerOnlyMessage={ownerOnlyMessage}
              ownerLocked={!isOwner}
              options={transcriptionOptions}
              placeholder={t("未设置", "Not set")}
              value={transcriptionValue}
              onChange={(nextValue) => {
                const typedValue = nextValue as TranscriptionProviderName;
                if (!typedValue || typedValue === voice.selection.selectedTranscriptionProvider) {
                  return;
                }
                onUpdateVoiceTranscriptionProvider(typedValue);
              }}
              onOpenChange={(nextOpen) => setOpenMenu(nextOpen ? "transcription" : null)}
            />
          ) : (
            <strong className="provider-popover-value">{transcriptionDisplayValue}</strong>
          )}
        </div>

        {isOwner ? (
          <p className="provider-popover-hint">
            {voiceSettingsPending
              ? t("正在应用新设置...", "Applying new voice settings...")
              : t(
                  "修改后会立即刷新房间配置；如果你正在通话，会安全重建当前语音链路。",
                  "Changes apply immediately; if you are in a live call, the current voice runtime will be restarted safely.",
                )}
          </p>
        ) : (
          <p className="provider-popover-hint">{ownerOnlyMessage}</p>
        )}

        {!voice.ready && voice.error ? (
          <div className="provider-popover-row">
            <span className="provider-popover-label">{t("错误", "Error")}</span>
            <strong className="provider-popover-value">{voice.error}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisProviderPopover({
  analysisProfilePending,
  analysisTogglePending,
  language,
  onOwnerOnlySettingAttempt,
  onToggleRealtimeAnalysis,
  onUpdateAnalysisProfile,
  roomMeta,
  showOwnerOnlyHint,
  t,
}: Pick<
  RoomPageViewProps,
  | "analysisProfilePending"
  | "analysisTogglePending"
  | "language"
  | "onToggleRealtimeAnalysis"
  | "onUpdateAnalysisProfile"
  | "roomMeta"
  | "t"
> & {
  onOwnerOnlySettingAttempt: () => void;
  showOwnerOnlyHint: boolean;
}) {
  const [openMenu, setOpenMenu] = useState<"profile" | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const analysis = roomMeta.providers.analysis;
  const isOwner = roomMeta.isCreator;
  const ownerOnlyMessage = t("仅房主才能设置这些选项。", "Only the room owner can change these settings.");
  const controlsDisabled = analysisTogglePending || analysisProfilePending || roomMeta.status === "ENDED";
  const selectedProfile = analysis.selection.selectedProfile;
  const displayValue = formatAnalysisProfileValue(selectedProfile, language);
  const availableProfileCount = analysis.selection.profileOptions.filter((option) => option.available).length;
  const canSelectProfile =
    isOwner &&
    (availableProfileCount > 1 ||
      Boolean(
        analysis.selection.selectedProfile &&
          analysis.selection.profileOptions.some(
            (option) => option.value === analysis.selection.selectedProfile && !option.available,
          ),
      ));
  const showLockedProfileControl = !isOwner;
  const profileOptions: PopoverInlineMenuOption[] = analysis.selection.profileOptions.map((option) => ({
    value: option.value,
    label: formatAnalysisProfileValue(option.value, language),
    disabled: !option.available,
  }));

  useEffect(() => {
    if (openMenu === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (popoverRef.current?.contains(target)) {
        return;
      }

      setOpenMenu(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  return (
    <div className="provider-tooltip">
      {showOwnerOnlyHint ? <div className="owner-only-tip">{ownerOnlyMessage}</div> : null}
      <div className="room-status provider-chip provider-chip-panel" tabIndex={0}>
        <div className="provider-chip-main">
          <span className="provider-chip-label">{t("大模型分析", "LLM Analysis")}</span>
          <strong className="provider-chip-value">{getAnalysisProviderLabel(analysis, language)}</strong>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={roomMeta.analysisEnabled}
          aria-disabled={!isOwner || analysisTogglePending || analysisProfilePending || roomMeta.status === "ENDED"}
          aria-label={t("切换实时大模型分析", "Toggle realtime LLM analysis")}
          className={`provider-chip-switch ${roomMeta.analysisEnabled ? "active" : ""}`}
          title={!isOwner ? ownerOnlyMessage : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (!isOwner) {
              onOwnerOnlySettingAttempt();
              return;
            }
            onToggleRealtimeAnalysis();
          }}
          disabled={analysisTogglePending || analysisProfilePending || roomMeta.status === "ENDED"}
        >
          <span className="provider-chip-switch-track">
            <span className="provider-chip-switch-thumb" />
          </span>
          <span className="provider-chip-switch-text">
            {analysisTogglePending ? "..." : roomMeta.analysisEnabled ? t("开", "On") : t("关", "Off")}
          </span>
        </button>
      </div>
      <div ref={popoverRef} className="provider-popover provider-popover-form" role="tooltip">
        <div className="provider-popover-title">{t("大模型分析", "LLM Analysis")}</div>

        <div className="provider-popover-row provider-popover-row-control">
          <span className="provider-popover-label">{t("分析方案", "Analysis profile")}</span>
          {canSelectProfile || showLockedProfileControl ? (
            <PopoverInlineMenu
              ariaLabel={t("选择大模型分析方案", "Select analysis profile")}
              displayValue={displayValue}
              disabled={controlsDisabled}
              isOpen={openMenu === "profile"}
              onOwnerOnlySettingAttempt={onOwnerOnlySettingAttempt}
              ownerOnlyMessage={ownerOnlyMessage}
              ownerLocked={!isOwner}
              options={profileOptions}
              placeholder={t("未设置", "Not set")}
              value={selectedProfile}
              onChange={(nextValue) => {
                const typedValue = nextValue as RoomAnalysisProfilePreference;
                if (!typedValue || typedValue === analysis.selection.selectedProfile) {
                  return;
                }
                onUpdateAnalysisProfile(typedValue);
              }}
              onOpenChange={(nextOpen) => setOpenMenu(nextOpen ? "profile" : null)}
            />
          ) : (
            <strong className="provider-popover-value">{displayValue}</strong>
          )}
        </div>

        {getAnalysisProviderDetails(analysis, language).map((item) => (
          <div key={`analysis-${item.label}`} className="provider-popover-row">
            <span className="provider-popover-label">{item.label}</span>
            <strong className="provider-popover-value">{item.value}</strong>
          </div>
        ))}

        {isOwner ? (
          <p className="provider-popover-hint">
            {analysisProfilePending
              ? t("正在应用新方案...", "Applying new analysis profile...")
              : t(
                  "切换方案后，新的实时分析与总结会按当前房间设置继续生成。",
                  "After switching profiles, new realtime analyses and summaries will follow the current room settings.",
                )}
          </p>
        ) : (
          <p className="provider-popover-hint">{ownerOnlyMessage}</p>
        )}
      </div>
    </div>
  );
}

function RoomSidebarPanel({
  analysisProfilePending,
  analysisTogglePending,
  isZh,
  language,
  micDevices,
  micSelectorOpen,
  micVolume,
  onCloseMicSelector,
  onSelectMic,
  onToggleMicSelector,
  onTogglePublicRoom,
  onToggleRealtimeAnalysis,
  onUpdateAnalysisProfile,
  onUpdateRoomTranscriptionLanguage,
  onUpdateVoiceSource,
  onUpdateVoiceTranscriptionProvider,
  overallInsights,
  roomMeta,
  publicTogglePending,
  scores,
  selectedMicId,
  suggestions,
  t,
  voiceSettingsPending,
}: Pick<
  RoomPageViewProps,
  | "analysisProfilePending"
  | "analysisTogglePending"
  | "isZh"
  | "language"
  | "micDevices"
  | "micSelectorOpen"
  | "micVolume"
  | "onCloseMicSelector"
  | "onSelectMic"
  | "onToggleMicSelector"
  | "onTogglePublicRoom"
  | "onToggleRealtimeAnalysis"
  | "onUpdateAnalysisProfile"
  | "onUpdateRoomTranscriptionLanguage"
  | "onUpdateVoiceSource"
  | "onUpdateVoiceTranscriptionProvider"
  | "overallInsights"
  | "roomMeta"
  | "publicTogglePending"
  | "scores"
  | "selectedMicId"
  | "suggestions"
  | "t"
  | "voiceSettingsPending"
>) {
  const selectedDevice = micDevices.find((device) => device.deviceId === selectedMicId);
  const ownerOnlyMessage = t("仅房主才能设置这些选项。", "Only the room owner can change these settings.");
  const ownerOnlyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ownerOnlyHintTarget, setOwnerOnlyHintTarget] = useState<
    "public" | "transcriptionLanguage" | "voice" | "analysis" | null
  >(null);
  const publicRoomOwnerLocked = !roomMeta.isCreator;
  const selectedLabel = selectedDevice
    ? selectedDevice.label ||
      (isZh
        ? `麦克风 ${micDevices.indexOf(selectedDevice) + 1}`
        : `Microphone ${micDevices.indexOf(selectedDevice) + 1}`)
    : isZh
      ? "默认麦克风"
      : "Default microphone";

  useEffect(() => {
    return () => {
      if (ownerOnlyNoticeTimerRef.current !== null) {
        clearTimeout(ownerOnlyNoticeTimerRef.current);
      }
    };
  }, []);

  const notifyOwnerOnlySettingFor = (
    target: "public" | "transcriptionLanguage" | "voice" | "analysis",
  ) => {
    setOwnerOnlyHintTarget(target);
    if (ownerOnlyNoticeTimerRef.current !== null) {
      clearTimeout(ownerOnlyNoticeTimerRef.current);
    }
    ownerOnlyNoticeTimerRef.current = setTimeout(() => {
      setOwnerOnlyHintTarget(null);
      ownerOnlyNoticeTimerRef.current = null;
    }, 2400);
  };

  return (
    <>
      <div className="sidebar-section">
        <h4>{t("实时比分", "Real-time Score")}</h4>
        <div className="score-card">
          <div className="score-box">
            <span className="label">{t("我方", "Our Side")}</span>
            <span
              className="value"
              style={{ color: scores.own >= scores.other ? "var(--primary)" : "inherit" }}
            >
              {scores.own}
            </span>
          </div>
          <div className="score-box">
            <span className="label">{t("对方", "Other Side")}</span>
            <span
              className="value"
              style={{ color: scores.other >= scores.own ? "var(--primary)" : "inherit" }}
            >
              {scores.other}
            </span>
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <h4>{t("双方观点", "Perspectives")}</h4>
        <div className="overall-insight-box">
          <div className="overall-insight-item">
            <strong>{t("我方", "Our Side")}</strong>
            <p className="analysis-insight" style={{ fontSize: "0.85rem" }}>
              {overallInsights.own || t("暂无洞察", "No insights yet")}
            </p>
          </div>
          <div style={{ height: "1px", background: "var(--line)" }} />
          <div className="overall-insight-item">
            <strong>{t("对方", "Other Side")}</strong>
            <p className="analysis-insight" style={{ fontSize: "0.85rem" }}>
              {overallInsights.other || t("暂无洞察", "No insights yet")}
            </p>
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <h4>{t("建议", "Suggestions")}</h4>
        <div className="overall-insight-box">
          <div className="overall-insight-item">
            <strong>{t("我方", "Our Side")}</strong>
            {suggestions.own.length > 0 ? (
              <div style={{ marginTop: "4px", fontSize: "0.85rem", color: "var(--muted)" }}>
                {suggestions.own.map((suggestion, index) => (
                  <p
                    key={`${suggestion}-${index}`}
                    className="analysis-insight"
                    style={{ margin: index === 0 ? 0 : "6px 0 0" }}
                  >
                    {suggestion}
                  </p>
                ))}
              </div>
            ) : (
              <p className="analysis-insight" style={{ fontSize: "0.85rem" }}>
                {t("暂无建议", "No suggestions yet")}
              </p>
            )}
          </div>
          <div style={{ height: "1px", background: "var(--line)" }} />
          <div className="overall-insight-item">
            <strong>{t("对方", "Other Side")}</strong>
            {suggestions.other.length > 0 ? (
              <div style={{ marginTop: "4px", fontSize: "0.85rem", color: "var(--muted)" }}>
                {suggestions.other.map((suggestion, index) => (
                  <p
                    key={`${suggestion}-${index}`}
                    className="analysis-insight"
                    style={{ margin: index === 0 ? 0 : "6px 0 0" }}
                  >
                    {suggestion}
                  </p>
                ))}
              </div>
            ) : (
              <p className="analysis-insight" style={{ fontSize: "0.85rem" }}>
                {t("暂无建议", "No suggestions yet")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-section sidebar-section-bottom">
        <h4>{t("服务状态", "Providers")}</h4>
        <div
          className="key-status-grid"
          style={{ fontSize: "0.75rem", gap: "8px", background: "transparent", padding: 0 }}
        >
          <div className="owner-only-tip-anchor">
            {ownerOnlyHintTarget === "public" ? <div className="owner-only-tip">{ownerOnlyMessage}</div> : null}
            <div className="room-status provider-chip provider-chip-panel visibility-chip-panel">
              <div className="provider-chip-main">
                <span className="provider-chip-label">{t("公开房间", "Public Room")}</span>
                <strong className="provider-chip-value">
                  {roomMeta.isPublic ? t("所有人可见", "Visible to everyone") : t("仅成员可见", "Members only")}
                </strong>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={roomMeta.isPublic}
                aria-disabled={publicRoomOwnerLocked || publicTogglePending}
                aria-label={t("切换公开房间", "Toggle public room")}
                className={`provider-chip-switch ${roomMeta.isPublic ? "active" : ""}`}
                title={publicRoomOwnerLocked ? ownerOnlyMessage : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (publicRoomOwnerLocked) {
                    notifyOwnerOnlySettingFor("public");
                    return;
                  }
                  onTogglePublicRoom();
                }}
                disabled={publicTogglePending}
              >
                <span className="provider-chip-switch-track">
                  <span className="provider-chip-switch-thumb" />
                </span>
                <span className="provider-chip-switch-text">
                  {publicTogglePending ? "..." : roomMeta.isPublic ? t("开", "On") : t("关", "Off")}
                </span>
              </button>
            </div>
          </div>

          <RoomTranscriptionLanguageControl
            onOwnerOnlySettingAttempt={() => notifyOwnerOnlySettingFor("transcriptionLanguage")}
            onUpdateRoomTranscriptionLanguage={onUpdateRoomTranscriptionLanguage}
            roomMeta={roomMeta}
            showOwnerOnlyHint={ownerOnlyHintTarget === "transcriptionLanguage"}
            t={t}
            voiceSettingsPending={voiceSettingsPending}
          />

          <VoiceProviderPopover
            language={language}
            onUpdateVoiceSource={onUpdateVoiceSource}
            onUpdateVoiceTranscriptionProvider={onUpdateVoiceTranscriptionProvider}
            onOwnerOnlySettingAttempt={() => notifyOwnerOnlySettingFor("voice")}
            roomMeta={roomMeta}
            showOwnerOnlyHint={ownerOnlyHintTarget === "voice"}
            t={t}
            voiceSettingsPending={voiceSettingsPending}
          />

          <div className="mic-selector-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              className="room-status provider-chip provider-chip-panel mic-selector-trigger"
              onClick={onToggleMicSelector}
              aria-expanded={micSelectorOpen}
              aria-label={isZh ? "选择麦克风" : "Select microphone"}
            >
              <span className="provider-chip-label mic-selector-label">{t("麦克风", "Microphone")}</span>
              <div className="provider-chip-main mic-selector-content">
                <strong className="provider-chip-value mic-selector-value" title={selectedLabel}>
                  {selectedLabel}
                </strong>
              </div>
              <span
                className="mic-vol-icon"
                style={{ "--mic-vol": micVolume } as CSSProperties}
                aria-hidden="true"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </span>
            </button>

            {micSelectorOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 98 }}
                  onClick={onCloseMicSelector}
                  aria-hidden="true"
                />
                <div className="mic-dropdown" role="listbox" aria-label={isZh ? "麦克风设备" : "Microphone devices"}>
                  <div className="mic-vol-bar-wrap">
                    <div className="mic-vol-bar-fill" style={{ width: `${Math.round(micVolume * 100)}%` }} />
                    <span className="mic-vol-label">
                      {isZh ? "实时音量" : "Level"}
                      <strong style={{ marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(micVolume * 100)}%
                      </strong>
                    </span>
                  </div>

                  <ul className="mic-device-list" role="group">
                    {micDevices.length === 0 ? (
                      <li className="mic-device-item mic-device-empty">
                        {isZh ? "未找到麦克风设备" : "No microphone found"}
                      </li>
                    ) : (
                      micDevices.map((device, index) => {
                        const label = device.label || (isZh ? `麦克风 ${index + 1}` : `Microphone ${index + 1}`);
                        const isActive = device.deviceId === selectedMicId;
                        return (
                          <li key={device.deviceId} role="option" aria-selected={isActive}>
                            <button
                              type="button"
                              className={`mic-device-item ${isActive ? "mic-device-active" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectMic(device.deviceId);
                              }}
                            >
                              <span className="mic-device-check" aria-hidden="true">
                                {isActive ? (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : null}
                              </span>
                              <span className="mic-device-label">{label}</span>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>

          <AnalysisProviderPopover
            analysisProfilePending={analysisProfilePending}
            analysisTogglePending={analysisTogglePending}
            language={language}
            onOwnerOnlySettingAttempt={() => notifyOwnerOnlySettingFor("analysis")}
            onToggleRealtimeAnalysis={onToggleRealtimeAnalysis}
            onUpdateAnalysisProfile={onUpdateAnalysisProfile}
            roomMeta={roomMeta}
            showOwnerOnlyHint={ownerOnlyHintTarget === "analysis"}
            t={t}
          />
        </div>
      </div>
    </>
  );
}

export function RoomPageView({
  activeStatusTooltip,
  analysisProfilePending,
  analysisTogglePending,
  analysisViewState,
  audioContainerRef,
  callButtonClassName,
  canConnectRoom,
  canLeaveVoiceCall,
  canParticipate,
  chatInput,
  chatInputRef,
  connectionState,
  endingRoom,
  isAudienceReadOnly,
  isCreator,
  isEnded,
  isInitialConnectionPending,
  isZh,
  language,
  messages,
  micDevices,
  micEnabled,
  micSelectorOpen,
  micVolume,
  onChatInputChange,
  onChatInputKeyDown,
  onCloseEndRoomConfirm,
  onCloseMicSelector,
  onCloseMobileAnalysis,
  onCloseSwitchConfirm,
  onConfirmEndRoom,
  onConfirmSwitch,
  onConnectRoom,
  onCloseActiveStatusTooltip,
  onConnectionStatusClick,
  onLeaveVoiceCall,
  onOpenEndRoomConfirm,
  onOpenMobileAnalysis,
  onSelectMic,
  onSpeakerSwitchAction,
  onStartVoiceCall,
  onSubmitTextMessage,
  onToggleMicSelector,
  onTogglePublicRoom,
  onToggleRawMessage,
  onToggleRealtimeAnalysis,
  onUpdateAnalysisProfile,
  onUpdateRoomTranscriptionLanguage,
  onUpdateVoiceSource,
  onUpdateVoiceTranscriptionProvider,
  onTranscriptionStatusClick,
  overallInsights,
  rawMessageId,
  roomConnectionStatusClass,
  roomDisplayName,
  roomError,
  roomId,
  roomInteractionBlocked,
  roomMeta,
  publicTogglePending,
  scores,
  scrollAnchorRef,
  selectedMicId,
  sendingText,
  showEndRoomConfirm,
  showMobileAnalysis,
  showSwitchConfirm,
  speakerMode,
  speakerSwitchEnabled,
  speakerSwitchPending,
  startingCallButtonLabel,
  suggestions,
  t,
  transcriptionState,
  userId,
  username,
  voiceCallStarting,
  voiceSettingsPending,
}: RoomPageViewProps) {
  const statusTooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeStatusTooltip === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (statusTooltipRef.current?.contains(target)) {
        return;
      }

      onCloseActiveStatusTooltip();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeStatusTooltip, onCloseActiveStatusTooltip]);

  const sidebarContent = (
        <RoomSidebarPanel
          analysisProfilePending={analysisProfilePending}
          analysisTogglePending={analysisTogglePending}
          isZh={isZh}
          language={language}
      micDevices={micDevices}
      micSelectorOpen={micSelectorOpen}
      micVolume={micVolume}
      onCloseMicSelector={onCloseMicSelector}
      onSelectMic={onSelectMic}
          onToggleMicSelector={onToggleMicSelector}
          onTogglePublicRoom={onTogglePublicRoom}
          onToggleRealtimeAnalysis={onToggleRealtimeAnalysis}
          onUpdateAnalysisProfile={onUpdateAnalysisProfile}
          onUpdateRoomTranscriptionLanguage={onUpdateRoomTranscriptionLanguage}
      onUpdateVoiceSource={onUpdateVoiceSource}
      onUpdateVoiceTranscriptionProvider={onUpdateVoiceTranscriptionProvider}
      overallInsights={overallInsights}
      roomMeta={roomMeta}
      publicTogglePending={publicTogglePending}
      scores={scores}
      selectedMicId={selectedMicId}
      suggestions={suggestions}
      t={t}
      voiceSettingsPending={voiceSettingsPending}
    />
  );

  return (
    <main className="room-page">
      <section className="room-shell room-shell-chat">
        <header className="room-header">
          <div className="room-header-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h1>{roomDisplayName}</h1>

              <div
                ref={statusTooltipRef}
                style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
              >
                <div style={{ position: "relative" }}>
                  <span className={`room-status ${roomConnectionStatusClass}`} onClick={onConnectionStatusClick}>
                    <span className="status-icon">C</span>
                    <span className="status-label-text">
                      {connectionState === "connected"
                        ? t("已连接", "Connected")
                        : connectionState === "connecting" || isInitialConnectionPending
                          ? t("连接中", "Connecting")
                          : t("断开", "Disconnected")}
                    </span>
                  </span>
                  {activeStatusTooltip === "connection" && (
                    <div className="status-tooltip">
                      {connectionState === "connected"
                        ? t("房间连接成功", "Room Connected")
                        : connectionState === "connecting" || isInitialConnectionPending
                          ? t("正在连接房间...", "Connecting to Room...")
                          : t("房间连接已断开", "Room Disconnected")}
                    </div>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <span
                    className={`room-status transcription-status ${transcriptionState}`}
                    onClick={onTranscriptionStatusClick}
                  >
                    <span className="status-icon">T</span>
                    <span className="status-label-text">
                      {transcriptionState === "ready"
                        ? t("转录中", "Transcription On")
                        : transcriptionState === "starting"
                          ? t("启动中", "Starting")
                          : t("转录关", "Transcription Off")}
                    </span>
                  </span>
                  {activeStatusTooltip === "transcription" && (
                    <div className="status-tooltip">
                      {transcriptionState === "ready"
                        ? t("实时语音转录已开启", "Transcription Active")
                        : transcriptionState === "starting"
                          ? t("正在启动转录引擎...", "Starting Transcription...")
                          : t("语音转录未开启", "Transcription Disabled")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="room-meta-row">
              <RoomIdCopyButton
                ariaLabel={t(`复制房间号 ${roomId}`, `Copy room ID ${roomId}`)}
                className="room-id-copy-button room-header-code"
                copiedLabel={t("复制成功", "Copied")}
                roomId={roomId}
                title={t("点击复制房间号", "Click to copy room ID")}
              >
                {roomId}
              </RoomIdCopyButton>
              <RoomMembersSummary roomMeta={roomMeta} t={t} />
            </div>
          </div>

          <Link className="room-back-link" href="/" title={t("返回", "Back")}>
            <span className="desktop-only ghost-btn" style={{ height: "40px" }}>
              {t("返回", "Back")}
            </span>
            <span className="mobile-only-flex back-icon-btn">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
          </Link>

          <div className="room-actions">
            <button
              type="button"
              className="ghost-btn mobile-only-flex"
              style={{ height: "40px" }}
              onClick={onOpenMobileAnalysis}
            >
              {t("详情", "Details")}
            </button>
            {speakerSwitchEnabled && canParticipate && (
              <button
                type="button"
                className="ghost-btn"
                style={{ height: "40px" }}
                onClick={onSpeakerSwitchAction}
                disabled={isEnded || connectionState === "connecting" || speakerSwitchPending}
              >
                {speakerSwitchPending
                  ? "..."
                  : speakerMode === "self"
                    ? t("切换", "Switch")
                    : t("退出切换", "Exit")}
              </button>
            )}
            {isCreator && (
              <button
                type="button"
                className="destructive-btn"
                style={{ height: "40px" }}
                onClick={onOpenEndRoomConfirm}
                disabled={endingRoom || isEnded}
              >
                {endingRoom ? "..." : t("结束房间", "End Room")}
              </button>
            )}
          </div>
        </header>

        {roomError && (
          <div className="room-error-box">
            <span style={{ fontSize: "1.2rem" }}>&bull;</span>
            {roomError}
          </div>
        )}

        <section className="chat-panel">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <p className="empty-chat">{t("暂无对话内容。", "Silence.")}</p>
            ) : (
              messages.map((message) => {
                if (message.type === "analysis") {
                  return (
                    <div key={message.id} className="message-row announcement">
                      <AnalysisMessage
                        analysisViewState={analysisViewState}
                        language={language}
                        message={message}
                        onToggleRawMessage={onToggleRawMessage}
                        rawMessageId={rawMessageId}
                        t={t}
                      />
                    </div>
                  );
                }

                const archiveSide = getArchiveMessageSide(message.participantId);
                const archiveOtherMessage = archiveSide === "other";
                const announcement = message.type === "summary" || archiveOtherMessage;
                const ownMessage = announcement ? false : isOwnMessage(message, userId, username);
                const alignSelf = archiveSide === "B" ? true : archiveSide === "A" ? false : ownMessage;
                const rowClass = announcement ? "announcement" : alignSelf ? "self" : "other";
                const messageTitle =
                  message.type === "summary"
                    ? t("最终总结", "Final Summary")
                    : archiveSide === null && ownMessage
                      ? t("我", "Me")
                      : message.senderName;

                return (
                  <div key={message.id} className={`message-row ${rowClass}`}>
                    {archiveOtherMessage ? (
                      <ArchiveOtherMessage language={language} message={message} t={t} />
                    ) : (
                      <article className={`bubble ${message.type} ${rowClass}`}>
                        <header className="bubble-meta">
                          <strong>{messageTitle}</strong>
                          <span className="bubble-source">
                            {message.type === "transcript" ? t("音", "V") : t("文", "T")}
                          </span>
                          <time dateTime={message.createdAt}>{formatTime(message.createdAt, language)}</time>
                        </header>
                        <p>{message.content}</p>
                      </article>
                    )}
                  </div>
                );
              })
            )}
            <div ref={scrollAnchorRef} />
          </div>
        </section>

        <form className="chat-form room-chat-form" onSubmit={onSubmitTextMessage}>
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChatInputChange(event.target.value)}
            onKeyDown={onChatInputKeyDown}
            placeholder={
              isEnded
                ? t("只读模式", "Read-only")
                : isAudienceReadOnly
                  ? t("旁听席只读", "Audience is read-only")
                  : t("输入消息...", "Type a message...")
            }
            disabled={roomInteractionBlocked}
            rows={1}
          />
          <div className="room-chat-controls">
            {connectionState === "connected" ? (
              canParticipate ? (
                <button
                  type="button"
                  className={callButtonClassName}
                  onClick={() => (canLeaveVoiceCall ? onLeaveVoiceCall() : onStartVoiceCall())}
                  disabled={roomInteractionBlocked || voiceCallStarting}
                  aria-busy={voiceCallStarting}
                  data-busy-label={startingCallButtonLabel}
                >
                  {micEnabled ? t("退出通话", "Leave") : t("通话", "Call")}
                </button>
              ) : null
            ) : canConnectRoom ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={onConnectRoom}
                disabled={connectionState === "connecting"}
              >
                {t("重连", "Reconnect")}
              </button>
            ) : null}

            <button type="submit" className="primary-btn" disabled={sendingText || roomInteractionBlocked}>
              {t("发送", "Send")}
            </button>
          </div>
        </form>

        <div ref={audioContainerRef} className="audio-container" />
      </section>

      <aside className="room-sidebar">{sidebarContent}</aside>

      <div
        className={`mobile-analysis-overlay ${showMobileAnalysis ? "active" : ""}`}
        onClick={onCloseMobileAnalysis}
      />
      <div className={`mobile-analysis-drawer ${showMobileAnalysis ? "active" : ""}`}>
        <button className="drawer-close-btn" onClick={onCloseMobileAnalysis} type="button">
          ×
        </button>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800 }}>
          {t("分析与统计", "Analysis & Stats")}
        </h2>
        {sidebarContent}
      </div>

      {showEndRoomConfirm && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <header className="auth-modal-header">
              <h2>{t("确认结束房间", "Confirm End Room")}</h2>
            </header>
            <div style={{ marginBottom: "24px", lineHeight: "1.6", color: "var(--muted)" }}>
              {t(
                "结束后将生成总结报告，房间将无法再进行对话，只能查看对话历史。是否确认结束？",
                "A summary report will be generated. The room will no longer allow new conversation and will be read-only. Are you sure you want to end?",
              )}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="ghost-btn" style={{ flex: 1 }} onClick={onCloseEndRoomConfirm} type="button">
                {t("取消", "Cancel")}
              </button>
              <button className="destructive-btn" style={{ flex: 1 }} onClick={onConfirmEndRoom} type="button">
                {t("确认", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSwitchConfirm && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <header className="auth-modal-header">
              <h2>{t("确认切换身份", "Confirm Switch Identity")}</h2>
            </header>
            <div style={{ marginBottom: "24px", lineHeight: "1.6", color: "var(--muted)" }}>
              {t(
                "你将切换到你的模拟对手，你可以使用该模式测试，或者在同一设备上双人辩论。",
                "You will switch to your simulated opponent. You can use this mode for testing or for a two-person debate on the same device.",
              )}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="ghost-btn" style={{ flex: 1 }} onClick={onCloseSwitchConfirm} type="button">
                {t("取消", "Cancel")}
              </button>
              <button className="primary-btn" style={{ flex: 1 }} onClick={onConfirmSwitch} type="button">
                {t("确认", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
