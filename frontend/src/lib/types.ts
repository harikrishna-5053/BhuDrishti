export interface WorkspaceItem {
  id: string;
  name: string;
  date: string;
  tile: string;
  cloud: number;
}

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  msg: string;
}

export type LayerState = {
  ndvi: { visible: boolean; opacity: number };
  rgb: { visible: boolean; opacity: number };
  india: { visible: boolean; opacity: number };
  states: { visible: boolean; opacity: number };
  districts: { visible: boolean; opacity: number };
  custom: { visible: boolean; opacity: number };
};
