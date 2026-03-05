"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ParticipantKind, Room, RoomEvent, Track } from "livekit-client";

import { ChatMessage } from "@/lib/chat-types";
import { decodeLivekitChatMessageEvent, LIVEKIT_CHAT_MESSAGE_TOPIC } from "@/lib/livekit-chat-event";

type TokenResponse = {
  token: string;
  livekitUrl: string;
  identity: string;
  displayName: string;
  transcriberEnabled: boolean;
  keyMasks: {
    livekit: string | null;
    deepgram: string | null;
  };
  keySources: {
    livekit: "user" | "system" | "unavailable";
    deepgram: "user" | "system" | "unavailable";
  };
  error?: string;
};

type MessagesResponse = {
  messages: ChatMessage[];
  error?: string;
};

type RoomMetaResponse = {
  room: {
    roomId: string;
    status: "ACTIVE" | "ENDED";
    endedAt: string | null;
    isCreator: boolean;
  };
  keyMasks: {
    livekit: string | null;
    deepgram: string | null;
  };
  keySources: {
    livekit: "user" | "system" | "unavailable";
    deepgram: "user" | "system" | "unavailable";
  };
  error?: string;
};

type RoomPageClientProps = {
  roomId: string;
  username: string;
};

type TranscriptionState = "idle" | "starting" | "ready" | "disabled";

type RoomMetaState = {
  status: "ACTIVE" | "ENDED";
  endedAt: string | null;
  isCreator: boolean;
  keyMasks: {
    livekit: string | null;
    deepgram: string | null;
  };
  keySources: {
    livekit: "user" | "system" | "unavailable";
    deepgram: "user" | "system" | "unavailable";
  };
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

function formatTime(value: string) {
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

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    map.set(message.id, message);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function isOwnMessage(message: ChatMessage, participantId: string, username: string) {
  if (message.senderName === username) {
    return true;
  }

  if (participantId && message.participantId) {
    return message.participantId === participantId;
  }

  return false;
}

export default function RoomPageClient({ roomId, username }: RoomPageClientProps) {
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const warmupRequestedRef = useRef(false);
  const connectStartedAtRef = useRef<number | null>(null);
  const latestMessageCreatedAtRef = useRef<string | null>(null);

  const [roomMeta, setRoomMeta] = useState<RoomMetaState>({
    status: "ACTIVE",
    endedAt: null,
    isCreator: false,
    keyMasks: { livekit: null, deepgram: null },
    keySources: { livekit: "system", deepgram: "system" },
  });
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [micEnabled, setMicEnabled] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [roomError, setRoomError] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [endingRoom, setEndingRoom] = useState(false);
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>("idle");

  const markTranscriptionReady = useCallback(() => {
    setTranscriptionState((current) => {
      if (current === "disabled" || current === "ready") {
        return current;
      }
      return "ready";
    });
  }, []);

  const upsertMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) {
      return;
    }
    setMessages((current) => {
      const merged = mergeMessages(current, incoming);
      const latest = merged[merged.length - 1];
      latestMessageCreatedAtRef.current = latest ? latest.createdAt : null;
      return merged;
    });
  }, []);

  const disconnectRoom = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;

    if (audioContainerRef.current) {
      audioContainerRef.current.innerHTML = "";
    }

    setConnectionState("disconnected");
    setMicEnabled(false);
    setParticipantId("");
    setTranscriptionState("idle");
    connectStartedAtRef.current = null;
  }, []);

  const fetchRoomMeta = useCallback(async () => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/meta`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as RoomMetaResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load room metadata");
    }

    setRoomMeta({
      status: payload.room.status,
      endedAt: payload.room.endedAt,
      isCreator: payload.room.isCreator,
      keyMasks: payload.keyMasks,
      keySources: payload.keySources,
    });
  }, [roomId]);

  const fetchMessages = useCallback(
    async (since?: string | null) => {
      const endpoint = new URL(
        `/api/rooms/${encodeURIComponent(roomId)}/messages`,
        window.location.origin,
      );
      if (since) {
        endpoint.searchParams.set("since", since);
      }

      const response = await fetch(endpoint.toString(), { cache: "no-store" });
      const payload = (await response.json()) as MessagesResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to fetch messages");
      }

      upsertMessages(payload.messages);
    },
    [roomId, upsertMessages],
  );

  const connectRoom = useCallback(async () => {
    if (connectionState !== "disconnected" || roomMeta.status === "ENDED") {
      return;
    }

    setRoomError("");
    setConnectionState("connecting");
    setTranscriptionState("starting");
    connectStartedAtRef.current = Date.now();

    try {
      const tokenRes = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const tokenPayload = (await tokenRes.json()) as TokenResponse;
      if (!tokenRes.ok) {
        throw new Error(tokenPayload.error ?? "Failed to fetch LiveKit token");
      }

      setRoomMeta((current) => ({
        ...current,
        keyMasks: tokenPayload.keyMasks,
        keySources: tokenPayload.keySources,
      }));

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio || !audioContainerRef.current) {
          return;
        }

        const element = track.attach();
        element.autoplay = true;
        audioContainerRef.current.appendChild(element);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) {
          return;
        }
        track.detach().forEach((element) => element.remove());
      });

      room.on(RoomEvent.Disconnected, () => {
        void fetchRoomMeta().catch(() => undefined);
        disconnectRoom();
      });
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.kind === ParticipantKind.AGENT) {
          markTranscriptionReady();
        }
      });
      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== LIVEKIT_CHAT_MESSAGE_TOPIC) {
          return;
        }

        const event = decodeLivekitChatMessageEvent(payload);
        if (!event || event.roomId !== roomId) {
          return;
        }

        upsertMessages([event.message]);
        if (event.message.type === "transcript") {
          markTranscriptionReady();
        }
      });

      await room.connect(tokenPayload.livekitUrl, tokenPayload.token);
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true);

      if (!tokenPayload.transcriberEnabled) {
        setTranscriptionState("disabled");
      } else if (
        [...room.remoteParticipants.values()].some(
          (participant) => participant.kind === ParticipantKind.AGENT,
        )
      ) {
        markTranscriptionReady();
      }

      roomRef.current = room;
      setParticipantId(tokenPayload.identity);
      setMicEnabled(true);
      setConnectionState("connected");
      void fetchMessages(latestMessageCreatedAtRef.current).catch(() => undefined);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Failed to connect room");
      disconnectRoom();
    }
  }, [
    connectionState,
    disconnectRoom,
    fetchMessages,
    fetchRoomMeta,
    markTranscriptionReady,
    roomId,
    roomMeta.status,
    upsertMessages,
  ]);

  const toggleMic = useCallback(async () => {
    if (!roomRef.current || connectionState !== "connected") {
      return;
    }

    const nextMicState = !micEnabled;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(nextMicState);
      setMicEnabled(nextMicState);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Failed to toggle microphone");
    }
  }, [connectionState, micEnabled]);

  async function endConversation() {
    if (!roomMeta.isCreator || roomMeta.status === "ENDED") {
      return;
    }

    setEndingRoom(true);
    setRoomError("");
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/end`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        room?: { status: "ACTIVE" | "ENDED"; endedAt: string | null };
        error?: string;
      };
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Failed to end room");
      }

      setRoomMeta((current) => ({
        ...current,
        status: payload.room!.status,
        endedAt: payload.room!.endedAt,
      }));
      disconnectRoom();
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Failed to end room");
    } finally {
      setEndingRoom(false);
    }
  }

  async function submitTextMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roomMeta.status === "ENDED") {
      return;
    }

    const content = chatInput.trim();
    if (!content) {
      return;
    }

    setSendingText(true);
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId,
          content,
        }),
      });

      const payload = (await response.json()) as { message?: ChatMessage; error?: string };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "Failed to send message");
      }

      setChatInput("");
      upsertMessages([payload.message]);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSendingText(false);
    }
  }

  useEffect(() => {
    latestMessageCreatedAtRef.current = null;
    setMessages([]);
    setRoomError("");
    void Promise.all([fetchRoomMeta(), fetchMessages(null)]).catch((error) => {
      setRoomError(error instanceof Error ? error.message : "Failed to load room data");
    });
  }, [fetchMessages, fetchRoomMeta]);

  useEffect(() => {
    if (roomMeta.status === "ENDED" && connectionState !== "disconnected") {
      disconnectRoom();
    }
  }, [connectionState, disconnectRoom, roomMeta.status]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (connectionState !== "connected" || transcriptionState !== "starting") {
      return;
    }

    const connectStartedAt = connectStartedAtRef.current;
    if (connectStartedAt === null) {
      return;
    }

    const hasTranscriptAfterConnect = messages.some((message) => {
      if (message.type !== "transcript") {
        return false;
      }

      const createdAtMs = new Date(message.createdAt).getTime();
      if (Number.isNaN(createdAtMs)) {
        return false;
      }

      return createdAtMs >= connectStartedAt;
    });

    if (hasTranscriptAfterConnect) {
      markTranscriptionReady();
    }
  }, [connectionState, markTranscriptionReady, messages, transcriptionState]);

  useEffect(() => {
    return () => {
      disconnectRoom();
    };
  }, [disconnectRoom]);

  useEffect(() => {
    if (warmupRequestedRef.current) {
      return;
    }
    if (roomMeta.status === "ENDED") {
      return;
    }

    warmupRequestedRef.current = true;
    const timer = window.setTimeout(() => {
      void fetch(`/api/rooms/${encodeURIComponent(roomId)}/warmup`, {
        method: "POST",
      }).catch(() => undefined);
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [roomId, roomMeta.status]);

  const isEnded = roomMeta.status === "ENDED";

  return (
    <main className="room-page">
      <section className="room-shell room-shell-chat">
        <header className="room-header" style={{ paddingBottom: '16px' }}>
          <div className="room-header-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{roomId}</h1>
              <span className={`room-status ${connectionState}`}>
                {connectionState === "connected"
                  ? "通话中"
                  : connectionState === "connecting"
                    ? "连接中"
                    : "未开始"}
              </span>
              <span className={`room-status transcription-status ${transcriptionState}`}>
                {transcriptionState === "ready"
                  ? "转录中"
                  : transcriptionState === "starting"
                    ? "启动中"
                    : transcriptionState === "disabled"
                      ? "未启用"
                      : "未转录"}
              </span>
            </div>
            <p style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
              <span>@{username}</span>
              {isEnded && (
                <>
                  <span style={{ color: 'var(--line-strong)' }}>|</span>
                  <span>已结束（{formatDate(roomMeta.endedAt)}）</span>
                </>
              )}
              <span style={{ color: 'var(--line-strong)' }}>|</span>
              <span title={`LiveKit: ${roomMeta.keySources.livekit === "user" ? "用户Key" : "平台默认"}\nDeepgram: ${roomMeta.keySources.deepgram === "user" ? "用户Key" : "平台默认"}`}>
                鉴权：{roomMeta.keySources.livekit === "user" || roomMeta.keySources.deepgram === "user" ? "自备 Key" : "平台默认"}
              </span>
            </p>
          </div>
          <div className="room-actions">
            <Link className="text-link-button" style={{ height: '40px' }} href="/">
              返回
            </Link>
            {roomMeta.isCreator ? (
              <button type="button" className="ghost-btn" style={{ height: '40px', background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)' }} onClick={() => void endConversation()} disabled={endingRoom || isEnded}>
                {endingRoom ? "结束中..." : isEnded ? "已结束" : "结束对话"}
              </button>
            ) : null}
          </div>
        </header>

        {roomError ? <p className="form-error room-error" style={{ margin: '0 0 16px' }}>{roomError}</p> : null}

        <section className="chat-panel">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <p className="empty-chat">暂无历史消息。</p>
            ) : (
              messages.map((message) => {
                const own = isOwnMessage(message, participantId, username);
                return (
                  <div key={message.id} className={`message-row ${own ? "self" : "other"}`}>
                    <article className={`bubble ${message.type} ${own ? "self" : "other"}`}>
                      <header className="bubble-meta">
                        <strong>{own ? "我" : message.senderName}</strong>
                        <span className={`bubble-source ${message.type}`}>
                          {message.type === "transcript" ? "语音转写" : "文字消息"}
                        </span>
                        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      </header>
                      <p>{message.content}</p>
                    </article>
                  </div>
                );
              })
            )}
            <div ref={scrollAnchorRef} />
          </div>
        </section>

        <form className="chat-form room-chat-form" onSubmit={submitTextMessage}>
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder={isEnded ? "房间已结束，仅可查看历史记录" : "输入消息..."}
            disabled={isEnded}
          />
          <button type="submit" className="primary-btn" disabled={sendingText || isEnded}>
            {sendingText ? "发送中" : "发送文字"}
          </button>
          
          {connectionState === "connected" ? (
            <>
              <button type="button" onClick={toggleMic} disabled={isEnded} className={micEnabled ? "primary-btn" : "ghost-btn"}>
                {micEnabled ? "静音" : "开麦"}
              </button>
              <button type="button" className="ghost-btn" onClick={disconnectRoom}>
                挂断语音
              </button>
            </>
          ) : (
            <button type="button" className="ghost-btn" onClick={connectRoom} disabled={connectionState === "connecting" || isEnded}>
              {connectionState === "connecting" ? "连接中..." : "开启语音"}
            </button>
          )}
        </form>

        <div ref={audioContainerRef} className="audio-container" />
      </section>
    </main>
  );
}
