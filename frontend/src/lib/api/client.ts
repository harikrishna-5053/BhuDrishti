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

export interface AOIStatsValue {
  result_id: string;
  filename: string;
  date: string;
  valid_count: number;
  nodata_count: number;
  min_ndvi: number;
  max_ndvi: number;
  mean_ndvi: number;
  median_ndvi: number;
  std_dev: number;
  valid_pixel_count?: number;
  nodata_pixel_count?: number;
  minimum?: number;
  maximum?: number;
  mean?: number;
  median?: number;
  standard_deviation?: number;
  raster_crs?: string;
  status?: string;
  message?: string;
}

export interface AOIAnalyticsResponse {
  series: AOIStatsValue[];
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

export interface VisualizeRequest {
  output_relative_path?: string;
  satellite?: string;
  processing_type: string;
  target_date?: string | null;
  year?: number | null;
  month?: number | null;
  composite_period?: string | null;
}

export interface VisualizeResponse {
  found: boolean;
  result_id?: string;
  filename?: string;
  relative_path?: string;
  absolute_path?: string;
  size_bytes?: number;
  category?: string;
  metadata?: any;
  preview_url?: string;
  tile_url_template?: string;
  message: string;
}

export interface AOITimeSeriesItem {
  result_id: string;
  filename: string;
  date: string;
  satellite: string;
  processing_type: string;
  valid_count: number;
  nodata_count: number;
  min_ndvi: number;
  max_ndvi: number;
  mean_ndvi: number;
  median_ndvi: number;
  std_dev: number;
  status: string;
}

export interface AOITimeSeriesRequest {
  output_relative_path?: string;
  satellite?: string;
  processing_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  geojson: any;
}

export interface AOITimeSeriesResponse {
  total_found: number;
  analyzed_count: number;
  failed_count: number;
  series: AOITimeSeriesItem[];
  warnings: string[];
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

  submitJob: (
    inputRelativePath: string,
    outputRelativePath: string,
    options?: {
      satellite?: string;
      processing_type?: string;
      target_date?: string | null;
      year?: number | null;
      month?: number | null;
      composite_period?: string | null;
      createPeriodicMosaic?: boolean;
    }
  ): Promise<{ job_id: string; status: string }> =>
    request<{ job_id: string; status: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        input_relative_path: inputRelativePath,
        output_relative_path: outputRelativePath,
        satellite: options?.satellite || "ALL",
        processing_type: options?.processing_type || "daywise",
        target_date: options?.target_date || null,
        year: options?.year || null,
        month: options?.month || null,
        composite_period: options?.composite_period || null,
        create_periodic_mosaic: options?.createPeriodicMosaic || false,
        create_mosaic: options?.createPeriodicMosaic || false,
      }),
    }),

  visualizeExistingNDVI: (req: VisualizeRequest): Promise<VisualizeResponse> =>
    request<VisualizeResponse>("/api/results/visualize", {
      method: "POST",
      body: JSON.stringify(req),
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
    request<JobResultsResponse>(`/api/results/job/${encodeURIComponent(jobId)}`),

  getDownloadUrl: (jobId: string, resultId: string, path?: string): string =>
    `${API_BASE_URL}/api/results/${encodeURIComponent(resultId)}/download${path ? `?path=${encodeURIComponent(path)}` : ""}`,

  getAOIAnalytics: (resultIds: string[], geojson: any): Promise<AOIAnalyticsResponse> =>
    request<AOIAnalyticsResponse>("/api/analytics/aoi", {
      method: "POST",
      body: JSON.stringify({
        result_ids: resultIds,
        geojson: geojson,
      }),
    }),

  fetchAOITimeSeries: (req: AOITimeSeriesRequest): Promise<AOITimeSeriesResponse> =>
    request<AOITimeSeriesResponse>("/api/analytics/aoi-timeseries", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

