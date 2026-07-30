export const API_BASE_URL =
  (import.meta.env.VITE_BHUDRISHTI_API_URL as string) || "http://127.0.0.1:8000";

export const MAX_VIEWER_FILE_MB = Number(
  import.meta.env.VITE_MAX_VIEWER_FILE_MB || 512
);
