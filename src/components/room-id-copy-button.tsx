"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

type RoomIdCopyButtonProps = {
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  copiedLabel?: string;
  roomId: string;
  title?: string;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Failed to copy room ID");
  }
}

export function RoomIdCopyButton({
  ariaLabel,
  children,
  className,
  copiedLabel = "复制成功",
  roomId,
  title,
}: RoomIdCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  return (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        void copyText(roomId)
          .then(() => {
            setCopied(true);
            if (resetTimerRef.current !== null) {
              window.clearTimeout(resetTimerRef.current);
            }
            resetTimerRef.current = window.setTimeout(() => {
              setCopied(false);
            }, 2000);
          })
          .catch(() => {
            setCopied(false);
          });
      }}
      title={title}
      type="button"
    >
      {children ?? roomId}
      {copied ? (
        <span aria-live="polite" className="copy-tooltip" role="status">
          {copiedLabel}
        </span>
      ) : null}
    </button>
  );
}
