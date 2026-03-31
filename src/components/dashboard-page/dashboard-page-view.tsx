import { type UiLanguage } from "@/lib/ui-language";

import { type DashboardTranslate } from "./dashboard-page-support";
import { AccountSettingsModal } from "./sections/account-settings-modal";
import { AuthModal } from "./sections/auth-modal";
import { DashboardHeader } from "./sections/dashboard-header";
import { ImportRoomModal } from "./sections/import-room-modal";
import { LivekitSettingsPanel } from "./sections/livekit-settings-panel";
import { LlmSettingsPanel } from "./sections/llm-settings-panel";
import { PublicRoomPanel } from "./sections/public-room-panel";
import { RoomActionsCard } from "./sections/room-actions-card";
import { RoomHistoryPanel } from "./sections/room-history-panel";
import { TranscriptionSettingsPanel } from "./sections/transcription-settings-panel";
import { UsageStatsPanel } from "./sections/usage-stats-panel";
import { type DashboardState } from "./use-dashboard-state";

type DashboardPageViewProps = {
  homePageFooterText: string | null;
  isZh: boolean;
  language: UiLanguage;
  onToggleLanguage: () => void;
  showUserProviderSettings: boolean;
  state: DashboardState;
  t: DashboardTranslate;
};

export function DashboardPageView({
  homePageFooterText,
  isZh,
  language,
  onToggleLanguage,
  showUserProviderSettings,
  state,
  t,
}: DashboardPageViewProps) {
  return (
    <>
      <main className="dashboard-page minimal-page">
        <section className="minimal-shell">
          <DashboardHeader
            isAuthenticated={state.isAuthenticated}
            isZh={isZh}
            onOpenAccountSettings={state.openAccountSettingsModal}
            onOpenImportRoom={state.openImportRoomModal}
            onLogout={state.handleLogout}
            onOpenLogin={state.openLoginModal}
            onOpenRegister={state.openRegisterModal}
            onToggleLanguage={onToggleLanguage}
            t={t}
            user={state.user}
          />

          <RoomActionsCard
            onCreateRoom={state.handleCreateRoom}
            onJoinRoom={state.handleJoinRoom}
            onRoomIdToJoinChange={state.setRoomIdToJoin}
            roomActionError={state.roomActionError}
            roomActionLoading={state.roomActionLoading}
            roomIdToJoin={state.roomIdToJoin}
            t={t}
          />

          <section className="minimal-details-wrap">
            <PublicRoomPanel
              language={language}
              onPageChange={state.loadPublicRoomsPage}
              publicRooms={state.publicRooms}
              publicRoomsError={state.publicRoomsError}
              publicRoomsLoading={state.publicRoomsLoading}
              publicRoomsPage={state.publicRoomsPage}
              publicRoomsTotalCount={state.publicRoomsTotalCount}
              publicRoomsTotalPages={state.publicRoomsTotalPages}
              t={t}
            />

            <RoomHistoryPanel
              createdRooms={state.createdRooms}
              dashboardLoading={state.dashboardLoading}
              hasHistory={state.hasHistory}
              isAuthenticated={state.isAuthenticated}
              joinedRooms={state.joinedRooms}
              language={language}
              onRefresh={state.refreshDashboard}
              t={t}
            />

            <UsageStatsPanel
              isAuthenticated={state.isAuthenticated}
              language={language}
              t={t}
              usageSummary={state.usageSummary}
            />

            {showUserProviderSettings ? (
              <>
                <LivekitSettingsPanel
                  isAuthenticated={state.isAuthenticated}
                  language={language}
                  livekitError={state.livekitError}
                  livekitForm={state.livekitForm}
                  livekitLoading={state.livekitLoading}
                  livekitStatus={state.livekitStatus}
                  onClearLivekit={state.clearLivekit}
                  onRefreshLivekitStatus={state.refreshLivekitStatus}
                  onSaveLivekit={state.saveLivekit}
                  setLivekitForm={state.setLivekitForm}
                  t={t}
                />

                <TranscriptionSettingsPanel
                  isAuthenticated={state.isAuthenticated}
                  language={language}
                  onClearTranscription={state.clearTranscription}
                  onSaveTranscription={state.saveTranscription}
                  onSetDefaultProvider={state.setDefaultProvider}
                  setTranscriptionForm={state.setTranscriptionForm}
                  t={t}
                  transcriptionError={state.transcriptionError}
                  transcriptionForm={state.transcriptionForm}
                  transcriptionLoading={state.transcriptionLoading}
                  transcriptionStatus={state.transcriptionStatus}
                />

                <LlmSettingsPanel
                  isAuthenticated={state.isAuthenticated}
                  language={language}
                  llmError={state.llmError}
                  llmForm={state.llmForm}
                  llmKeyStatus={state.llmKeyStatus}
                  llmLoading={state.llmLoading}
                  onClearLlm={state.clearLlm}
                  onRefreshLlmStatus={state.refreshLlmStatus}
                  onSaveLlm={state.saveLlm}
                  setLlmForm={state.setLlmForm}
                  t={t}
                />
              </>
            ) : null}
          </section>
        </section>

        {homePageFooterText ? (
          <footer className="home-page-footer" aria-label={t("底部信息", "Footer information")}>
            <p>{homePageFooterText}</p>
          </footer>
        ) : null}
      </main>

      {state.authMode ? (
        <AuthModal
          authCodeCountdown={state.authCodeCountdown}
          authCodeLoading={state.authCodeLoading}
          authCodeMessage={state.authCodeMessage}
          authError={state.authError}
          authForm={state.authForm}
          authLoading={state.authLoading}
          linuxDoConnectEnabled={state.linuxDoConnectEnabled}
          authMode={state.authMode}
          authNextPath={state.authNextPath}
          authTitle={state.authTitle}
          onClose={state.closeAuthModal}
          onSendCode={state.sendRegisterVerificationCode}
          onSubmit={state.handleAuthSubmit}
          onSwitchMode={state.switchAuthMode}
          setAuthForm={state.setAuthForm}
          t={t}
        />
      ) : null}

      {state.accountSettingsOpen && state.user ? (
        <AccountSettingsModal
          changePasswordCodeCountdown={state.changePasswordCodeCountdown}
          changePasswordCodeLoading={state.changePasswordCodeLoading}
          changePasswordCodeMessage={state.changePasswordCodeMessage}
          changePasswordError={state.changePasswordError}
          changePasswordForm={state.changePasswordForm}
          changePasswordLoading={state.changePasswordLoading}
          changeUsernameError={state.changeUsernameError}
          changeUsernameForm={state.changeUsernameForm}
          changeUsernameLoading={state.changeUsernameLoading}
          changeUsernameSuccess={state.changeUsernameSuccess}
          onClose={state.closeAccountSettingsModal}
          onSendChangePasswordCode={state.sendChangePasswordVerificationCode}
          onSubmitChangePassword={state.handleChangePasswordSubmit}
          onSubmitChangeUsername={state.handleChangeUsernameSubmit}
          setChangePasswordForm={state.setChangePasswordForm}
          setChangeUsernameForm={state.setChangeUsernameForm}
          t={t}
          user={state.user}
        />
      ) : null}

      {state.importRoomOpen ? (
        <ImportRoomModal
          importRoomError={state.importRoomError}
          importRoomLoading={state.importRoomLoading}
          importRoomSourceUrl={state.importRoomSourceUrl}
          onClose={state.closeImportRoomModal}
          onSourceUrlChange={state.setImportRoomSourceUrl}
          onUpload={state.importArchiveRoom}
          t={t}
        />
      ) : null}
    </>
  );
}
