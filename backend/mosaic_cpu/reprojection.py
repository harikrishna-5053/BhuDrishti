import numpy as np
from pyproj import Transformer


class Reprojector:

    def __init__(
        self,
        src_epsg,
        dst_epsg="EPSG:4326"
    ):

        self.transformer = Transformer.from_crs(
            src_epsg,
            dst_epsg,
            always_xy=True
        )


    def reproject_block(
        self,
        data,
        geo_transform,
        xoff,
        yoff
    ):

        height, width = data.shape


        rows, cols = np.indices(
            (height, width)
        )


        # Original tile pixel position
        cols = cols + xoff
        rows = rows + yoff


        xs = (
            geo_transform[0]
            +
            cols * geo_transform[1]
            +
            rows * geo_transform[2]
            +
            geo_transform[1] / 2
        )


        ys = (
            geo_transform[3]
            +
            cols * geo_transform[4]
            +
            rows * geo_transform[5]
            +
            geo_transform[5] / 2
        )


        lon, lat = self.transformer.transform(
            xs,
            ys
        )


        return lon, lat