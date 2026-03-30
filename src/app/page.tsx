import DashboardPageClient from "@/components/dashboard-page/dashboard-page";
import { getCurrentUser } from "@/lib/auth";
import { getUserTranscriptionSettingsStatus } from "@/features/transcription/core/user-settings";
import { getHomePageFooterText, getUserProviderKeysMode, isLinuxDoConnectEnabled } from "@/lib/env";
import { getUserLlmKeyStatus } from "@/lib/llm-provider-keys";
import { getUserLivekitCredentialStatus } from "@/lib/livekit-credentials";
import { getPublicRoomsPage } from "@/lib/public-rooms";
import { prisma } from "@/lib/prisma";
import { toRoomSummary } from "@/lib/room-summary";
import { getUserUsageSummary } from "@/lib/usage-stats";

export const dynamic = "force-dynamic";

type HomePageSearchParams = {
  auth?: string | string[];
  error?: string | string[];
  next?: string | string[];
};

function normalizeAuthMode(mode?: string | string[]) {
  if (typeof mode !== "string") {
    return null;
  }
  if (mode === "login" || mode === "register") {
    return mode;
  }
  return null;
}

function normalizeNextPath(path?: string | string[]) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
    return null;
  }
  return path;
}

function normalizeAuthError(error?: string | string[]) {
  if (typeof error !== "string") {
    return "";
  }

  return error.trim().slice(0, 240);
}

type HomePageProps = {
  searchParams: Promise<HomePageSearchParams>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [user, publicRoomsResult] = await Promise.all([getCurrentUser(), getPublicRoomsPage(1)]);
  const userProviderKeysMode = getUserProviderKeysMode();
  const linuxDoConnectEnabled = isLinuxDoConnectEnabled();
  const footerText = getHomePageFooterText();
  const allowUserProviderKeys = userProviderKeysMode !== "false";
  const initialAuthMode = user ? null : normalizeAuthMode(params?.auth);
  const initialAuthError = user ? "" : normalizeAuthError(params?.error);
  const initialNextPath = normalizeNextPath(params?.next);

  if (!user) {
    return (
      <DashboardPageClient
        initialAuthError={initialAuthError}
        initialUser={null}
        initialCreatedRooms={[]}
        initialJoinedRooms={[]}
        initialPublicRooms={publicRoomsResult.rooms}
        initialPublicRoomsPage={publicRoomsResult.page}
        initialPublicRoomsTotalCount={publicRoomsResult.totalCount}
        initialPublicRoomsTotalPages={publicRoomsResult.totalPages}
        initialLivekitStatus={null}
        initialTranscriptionStatus={null}
        initialLlmKeyStatus={null}
        initialUsageSummary={null}
        linuxDoConnectEnabled={linuxDoConnectEnabled}
        initialUserProviderKeysMode={userProviderKeysMode}
        initialAuthMode={initialAuthMode}
        initialNextPath={initialNextPath}
        homePageFooterText={footerText}
      />
    );
  }

  const [createdRooms, joinedRooms, livekitStatus, transcriptionStatus, llmKeyStatus, usageSummary] =
    await Promise.all([
    prisma.room.findMany({
      where: {
        createdById: user.id,
      },
      include: {
        _count: {
          select: {
            participants: true,
            messages: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.roomParticipant.findMany({
      where: {
        userId: user.id,
        room: {
          createdById: {
            not: user.id,
          },
        },
      },
      include: {
        room: {
          include: {
            _count: {
              select: {
                participants: true,
                messages: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastSeenAt: "desc",
      },
    }),
      allowUserProviderKeys ? getUserLivekitCredentialStatus(user.id) : Promise.resolve(null),
      allowUserProviderKeys ? getUserTranscriptionSettingsStatus(user.id) : Promise.resolve(null),
      allowUserProviderKeys ? getUserLlmKeyStatus(user.id) : Promise.resolve(null),
      getUserUsageSummary(user.id),
    ]);

  return (
    <DashboardPageClient
      initialAuthError={initialAuthError}
      initialUser={{
        email: user.email,
        id: user.id,
        username: user.username,
      }}
      initialCreatedRooms={createdRooms.map(toRoomSummary)}
      initialJoinedRooms={joinedRooms.map((entry) => ({
        ...toRoomSummary(entry.room),
        joinedAt: entry.joinedAt.toISOString(),
      }))}
      initialPublicRooms={publicRoomsResult.rooms}
      initialPublicRoomsPage={publicRoomsResult.page}
      initialPublicRoomsTotalCount={publicRoomsResult.totalCount}
      initialPublicRoomsTotalPages={publicRoomsResult.totalPages}
      initialLivekitStatus={livekitStatus}
      initialTranscriptionStatus={transcriptionStatus}
      initialLlmKeyStatus={llmKeyStatus}
      initialUsageSummary={usageSummary}
      linuxDoConnectEnabled={linuxDoConnectEnabled}
      initialUserProviderKeysMode={userProviderKeysMode}
      initialAuthMode={initialAuthMode}
      initialNextPath={initialNextPath}
      homePageFooterText={footerText}
    />
  );
}
