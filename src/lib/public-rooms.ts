import { prisma } from "@/lib/prisma";
import { toRoomSummary } from "@/lib/room-summary";

export const PUBLIC_ROOM_PAGE_SIZE = 10;

export function normalizeRoomsPage(value: number | string | null | undefined) {
  const page = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

export async function getPublicRoomsPage(pageInput?: number | string | null) {
  const requestedPage = normalizeRoomsPage(pageInput);
  const where = {
    isPublic: true,
  };

  const totalCount = await prisma.room.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_ROOM_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const rooms =
    totalCount === 0
      ? []
      : await prisma.room.findMany({
          where,
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
          skip: (page - 1) * PUBLIC_ROOM_PAGE_SIZE,
          take: PUBLIC_ROOM_PAGE_SIZE,
        });

  return {
    rooms: rooms.map(toRoomSummary),
    page,
    pageSize: PUBLIC_ROOM_PAGE_SIZE,
    totalCount,
    totalPages,
  };
}
