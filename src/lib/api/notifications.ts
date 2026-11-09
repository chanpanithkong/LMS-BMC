import type { NotificationRecord, Row } from "@/types";
import { apiRequest, resource } from "./client";

export const notificationsApi = {
  ...resource<NotificationRecord>("/notifications"),
  markRead: (id: string) => apiRequest<NotificationRecord>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => apiRequest<void>("/notifications-read-all", { method: "POST" }),
  settings: resource<Row>("/notification-settings"),
};
