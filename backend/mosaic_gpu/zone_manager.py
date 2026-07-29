from osgeo import gdal, osr
import os


def get_epsg_from_tiff(filename):

    ds = gdal.Open(filename)

    if ds is None:
        raise RuntimeError(
            f"Cannot open {filename}"
        )

    projection = ds.GetProjection()

    srs = osr.SpatialReference()
    srs.ImportFromWkt(projection)

    epsg = srs.GetAuthorityCode(None)

    ds = None

    if epsg is None:
        raise RuntimeError(
            "EPSG not found"
        )

    return int(epsg)



def get_utm_zone(epsg):

    # Sentinel northern hemisphere

    if 32601 <= epsg <= 32660:

        return epsg - 32600

    else:

        raise ValueError(
            f"Not Sentinel UTM EPSG: {epsg}"
        )



def group_tiles_by_zone(files):

    zones = {}


    for file in files:

        epsg = get_epsg_from_tiff(file)

        zone = get_utm_zone(epsg)


        if zone not in zones:

            zones[zone] = []


        zones[zone].append(file)



    return zones