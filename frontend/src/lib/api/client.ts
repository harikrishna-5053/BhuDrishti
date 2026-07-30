import { API_BASE_URL } from "./config";

export interface HealthResponse {
  status: string;
  application: string;
  mode: string;
  pipeline_integration: string;
}

export interface RootLocation {
  path: string;
  exists: boolean;
}

export interface RootsResponse {
  input: RootLocation;
  output: RootLocation;
}

export interface DirectoryItem {
  name: string;
  relative_path: string;
}

export interface DirectoriesResponse {
  scope: string;
  current_relative_path: string;
  parent_relative_path: string | null;
  directories: DirectoryItem[];
}

export interface JobSummary {
  job_id: string;
  status: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  input_directory: string;
  output_directory: string;
  current_stage: string;
  current: number;
  total: number;
  progress_percent?: number | null;
  indeterminate: boolean;
  current_zip: string;
  current_tile: string;
  message: string;
  error?: string | null;
  result?: {
    total_zip_files: number;
    already_processed: number;
    processed_zip_files: number;
    skipped_outside_india: number;
    failed_zip_files: number;
    ndvi_outputs_created: number;
    mosaic_outputs_created: number;
    elapsed_seconds: number;
  } | null;
}

export interface JobEvent {
  sequence: number;
  timestamp: string;
  type: string;
  stage: string;
  message: string;
  current: number;
  total: number;
  zip_name: string;
  tile_id: string;
}

export interface JobEventsResponse {
  job_id: string;
  events: JobEvent[];
  latest_sequence: number;
}

export interface ResultItem {
  result_id: string;
  job_id: string;
  filename: string;
  relative_path: string;
  size_bytes: number;
  file_type: string;
  created_at: string;
  category: string;
  type?: string;
}

export interface JobResultsResponse {
  job_id: string;
  results: ResultItem[];
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && data.detail) {
        errorDetail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Use fallback errorDetail
    }
    throw new Error(errorDetail);
  }

  return res.json();
}

export const api = {
  getHealth: async (): Promise<HealthResponse> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    try {
      const data = await request<HealthResponse>("/api/health", { signal: controller.signal });
      clearTimeout(id);
      return data;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  },

  getRoots: (): Promise<RootsResponse> => request<RootsResponse>("/api/filesystem/roots"),

  getDirectories: (scope: "input" | "output", relativePath: string = ""): Promise<DirectoriesResponse> =>
    request<DirectoriesResponse>(
      `/api/filesystem/directories?scope=${encodeURIComponent(scope)}&relative_path=${encodeURIComponent(relativePath)}`
    ),

  createDirectory: (scope: "output", parentRelativePath: string, directoryName: string): Promise<DirectoriesResponse> =>
    request<DirectoriesResponse>("/api/filesystem/directories", {
      method: "POST",
      body: JSON.stringify({
        scope,
        parent_relative_path: parentRelativePath,
        directory_name: directoryName,
      }),
    }),

  submitJob: (inputRelativePath: string, outputRelativePath: string, createPeriodicMosaic: boolean = true): Promise<{ job_id: string; status: string }> =>
    request<{ job_id: string; status: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        input_relative_path: inputRelativePath,
        output_relative_path: outputRelativePath,
        create_periodic_mosaic: createPeriodicMosaic,
      }),
    }),

  getJobStatus: (jobId: string): Promise<JobSummary> =>
    request<JobSummary>(`/api/jobs/${encodeURIComponent(jobId)}`),

  getJobEvents: (jobId: string, afterSequence: number = 0): Promise<JobEventsResponse> =>
    request<JobEventsResponse>(
      `/api/jobs/${encodeURIComponent(jobId)}/events?after_sequence=${afterSequence}`
    ),

  cancelJob: (jobId: string): Promise<JobSummary> =>
    request<JobSummary>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    }),

  getJobResults: (jobId: string): Promise<JobResultsResponse> =>
    request<JobResultsResponse>(`/api/jobs/${encodeURIComponent(jobId)}/results`),

  getDownloadUrl: (jobId: string, resultId: string): string =>
    `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/results/${encodeURIComponent(resultId)}/download`,
};
