export type ChatMessage = {
  id: string;
  type: "text" | "transcript" | "analysis" | "summary";
  senderName: string;
  participantId: string | null;
  content: string;
  createdAt: string;
};
