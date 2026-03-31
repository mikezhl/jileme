import { useRef } from "react";

import { type DashboardTranslate } from "../dashboard-page-support";

type ImportRoomModalProps = {
  importRoomError: string;
  importRoomLoading: boolean;
  importRoomSourceUrl: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  onSourceUrlChange: (value: string) => void;
  t: DashboardTranslate;
};

const ASSET_LINKS = {
  debateTxtNormalizationSpec: "/api/rooms/import-archive/assets/debate-txt-normalization-spec",
  newsValueRecordJson: "/api/rooms/import-archive/assets/news-value-record-json",
  newsValueTestTxt: "/api/rooms/import-archive/assets/news-value-test-txt",
} as const;

export function ImportRoomModal({
  importRoomError,
  importRoomLoading,
  importRoomSourceUrl,
  onClose,
  onUpload,
  onSourceUrlChange,
  t,
}: ImportRoomModalProps) {
  const title = t("导入房间", "Import Room");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className="auth-modal-overlay"
      role="dialog"
      aria-label={title}
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !importRoomLoading) {
          onClose();
        }
      }}
    >
      <section className="auth-modal import-room-modal">
        <div className="import-room-content">
          <div className="settings-field-block">
            <span className="settings-field-label">{title}</span>
            <p className="settings-field-desc">
              {t(
                "上传标准发言记录后，会创建一个公开只读的归档房间，并在导入成功后自动跳转。",
                "Upload a normalized debate record to create a public read-only archive room, then jump to it automatically.",
              )}
            </p>
          </div>

          <ol className="import-room-steps">
            <li>
              <strong>{t("先准备带说话人标注的 TXT", "Prepare a speaker-labeled TXT first")}</strong>
              <p>
                {t("把想要导入的辩论内容转录为带有说话人标注的 txt，推荐使用 WhisperX。", "Transcribe the debate into a speaker-labeled TXT, preferably with WhisperX.")}
              </p>
              <div className="import-room-links">
                <a href={ASSET_LINKS.newsValueTestTxt} target="_blank" rel="noreferrer">
                  {t("例子：data/新闻价值与人伦道德谁更重要/test.txt", "Example: data/新闻价值与人伦道德谁更重要/test.txt")}
                </a>
              </div>
            </li>

            <li>
              <strong>{t("转成标准发言记录 JSON", "Convert it into the normalized JSON record")}</strong>
              <p>
                {t(
                  "根据 debate-txt-normalization-spec.md 把转录内容转化为标准发言记录，推荐使用 Codex 等 agent 进行转化。",
                  "Transform the transcript into the normalized debate record according to debate-txt-normalization-spec.md. Codex-like agents are recommended.",
                )}
              </p>
              <div className="import-room-links">
                <a href={ASSET_LINKS.debateTxtNormalizationSpec} target="_blank" rel="noreferrer">
                  debate-txt-normalization-spec.md
                </a>
                <a href={ASSET_LINKS.newsValueRecordJson} target="_blank" rel="noreferrer">
                  {t(
                    "例子：data/新闻价值与人伦道德谁更重要/record.json",
                    "Example: data/新闻价值与人伦道德谁更重要/record.json",
                  )}
                </a>
              </div>
            </li>
          </ol>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="import-room-file-input"
            disabled={importRoomLoading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) {
                return;
              }

              void onUpload(file);
            }}
          />

          <div className="settings-field-block">
            <label htmlFor="import-room-source-url" className="settings-field-label">
              {t("来源链接", "Source URL")}
            </label>
            <input
              id="import-room-source-url"
              value={importRoomSourceUrl}
              onChange={(event) => onSourceUrlChange(event.target.value)}
              placeholder={t("请输入原始辩论内容的来源链接", "Enter the source URL of the original debate content")}
              autoComplete="url"
              inputMode="url"
              disabled={importRoomLoading}
            />
          </div>

          {importRoomError ? <p className="form-error" style={{ margin: 0 }}>{importRoomError}</p> : null}

          <div className="import-room-actions">
            <button type="button" className="ghost-btn" disabled={importRoomLoading} onClick={onClose}>
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={importRoomLoading || importRoomSourceUrl.trim().length === 0}
              onClick={() => fileInputRef.current?.click()}
            >
              {importRoomLoading ? t("导入中...", "Importing...") : t("上传", "Upload")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
