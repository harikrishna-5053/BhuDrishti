import { create } from "zustand";
import type { LoadedNDVIRaster, SelectedPixel } from "@/lib/geotiff/types";
import type { ColorRampPreset } from "@/lib/ndvi";

interface GeoTIFFState {
  raster: LoadedNDVIRaster | null;
  activeResultId: string | null;
  visible: boolean;
  opacity: number;
  loading: boolean;
  loadingStage: string;
  error: string | null;
  selectedPixel: SelectedPixel | null;
  zoomTrigger: number;
  colorRamp: ColorRampPreset;

  setRaster: (raster: LoadedNDVIRaster | null, resultId?: string | null) => void;
  setActiveResultId: (id: string | null) => void;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setLoading: (loading: boolean, stage?: string) => void;
  setError: (error: string | null) => void;
  setSelectedPixel: (pixel: SelectedPixel | null) => void;
  setColorRamp: (colorRamp: ColorRampPreset) => void;
  triggerZoomToRaster: () => void;
  clearRaster: () => void;
}

export const useGeoTIFFStore = create<GeoTIFFState>((set) => ({
  raster: null,
  activeResultId: null,
  visible: true,
  opacity: 0.85,
  loading: false,
  loadingStage: "",
  error: null,
  selectedPixel: null,
  zoomTrigger: 0,
  colorRamp: "ndvi",

  setRaster: (raster, resultId = null) =>
    set({
      raster,
      activeResultId: resultId ?? null,
      visible: true,
      error: null,
      loading: false,
      selectedPixel: null,
      zoomTrigger: Date.now(),
    }),

  setActiveResultId: (activeResultId) => set({ activeResultId }),

  setVisible: (visible) => set({ visible }),

  setOpacity: (opacity) => set({ opacity }),

  setLoading: (loading, stage = "") => set({ loading, loadingStage: stage }),

  setError: (error) => set({ error, loading: false }),

  setSelectedPixel: (pixel) => set({ selectedPixel: pixel }),

  setColorRamp: (colorRamp) => set({ colorRamp }),

  triggerZoomToRaster: () => set((s) => ({ zoomTrigger: s.zoomTrigger + 1 })),

  clearRaster: () =>
    set({
      raster: null,
      activeResultId: null,
      selectedPixel: null,
      error: null,
      loading: false,
    }),
}));
