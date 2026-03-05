export type ChatMessage = {
  id: string;
  type: "text" | "transcript";
  senderName: string;
  participantId: string | null;
  content: string;
  createdAt: string;
};
