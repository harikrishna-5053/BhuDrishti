export interface WorkspaceItem {
  id: string;
  name: string;
  date: string;
  tile: string;
  cloud: number;
}

export type LogLevel =
  | "INFO"
  | "SUCCESS"
  | "WARN"
  | "ERROR";

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  msg: string;
}