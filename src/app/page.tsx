import DashboardPageClient from "@/components/dashboard-page/dashboard-page";
import { getCurrentUser } from "@/lib/auth";
import { getUserTranscriptionSettingsStatus } from "@/features/transcription/core/user-settings";
import { getUserProviderKeysMode } from "@/lib/env";
import { getUserLlmKeyStatus } from "@/lib/llm-provider-keys";
import { getUserLivekitCredentialStatus } from "@/lib/livekit-credentials";
import { getPublicRoomsPage } from "@/lib/public-rooms";
import { prisma } from "@/lib/prisma";
import { toRoomSummary } from "@/lib/room-summary";
import { getUserUsageSummary } from "@/lib/usage-stats";

export const dynamic = "force-dynamic";

type HomePageSearchParams = {
  auth?: string;
  next?: string;
};

function normalizeAuthMode(mode?: string) {
  if (mode === "login" || mode === "register") {
    return mode;
  }
  return null;
}

function normalizeNextPath(path?: string) {
  if (!path || !path.startsWith("/")) {
    return null;
  }
  return path;
}

type HomePageProps = {
  searchParams: Promise<HomePageSearchParams>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [user, publicRoomsResult] = await Promise.all([getCurrentUser(), getPublicRoomsPage(1)]);
  const userProviderKeysMode = getUserProviderKeysMode();
  const allowUserProviderKeys = userProviderKeysMode !== "false";
  const initialAuthMode = user ? null : normalizeAuthMode(params?.auth);
  const initialNextPath = normalizeNextPath(params?.next);

  if (!user) {
    return (
      <DashboardPageClient
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
        initialUserProviderKeysMode={userProviderKeysMode}
        initialAuthMode={initialAuthMode}
        initialNextPath={initialNextPath}
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
      initialUser={{
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
      initialUserProviderKeysMode={userProviderKeysMode}
      initialAuthMode={initialAuthMode}
      initialNextPath={initialNextPath}
    />
  );
}
