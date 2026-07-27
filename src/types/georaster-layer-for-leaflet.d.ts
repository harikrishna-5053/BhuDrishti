declare module "georaster-layer-for-leaflet" {
  import L from "leaflet";

  export interface GeoRasterLayerOptions extends L.GridLayerOptions {
    georaster?: any;
    pixelValuesToColorFn?: (pixelValues: number[]) => string | null;
    resolution?: number;
    opacity?: number;
  }

  export default class GeoRasterLayer extends L.GridLayer {
    constructor(options?: GeoRasterLayerOptions);
  }
}

declare module "georaster" {
  export default function parseGeoRaster(input: any): Promise<any>;
}
