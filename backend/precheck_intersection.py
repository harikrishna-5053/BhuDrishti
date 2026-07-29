import zipfile
import tempfile
import os
import xml.etree.ElementTree as ET


# ==========================================================
# FIND MTD_TL.xml INSIDE ZIP (NO FULL EXTRACTION)
# ==========================================================

def _find_mtd_xml_in_zip(zip_path):
    with zipfile.ZipFile(zip_path, "r") as z:
        for f in z.namelist():
            if f.endswith("MTD_TL.xml"):
                return f
    return None


# ==========================================================
# EXTRACT ONLY REQUIRED FILE FROM ZIP
# ==========================================================

def _extract_single_file(zip_path, internal_path):
    with zipfile.ZipFile(zip_path, "r") as z:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(z.read(internal_path))
            return tmp.name


# ==========================================================
# READ TILE GEOCODING
# ==========================================================

def _read_geocoding(xml_file):

    tree = ET.parse(xml_file)
    root = tree.getroot()

    for tg in root.iter():

        if "Tile_Geocoding" not in tg.tag:
            continue

        epsg = None
        ulx = uly = xdim = ydim = ncols = nrows = None

        for e in tg.iter():

            tag = e.tag.split("}")[-1]

            if tag == "HORIZONTAL_CS_CODE":
                epsg = int(e.text.split(":")[-1])

        for child in tg:

            tag = child.tag.split("}")[-1]

            if tag == "Size" and child.attrib.get("resolution") == "10":

                for i in child:

                    t = i.tag.split("}")[-1]

                    if t == "NCOLS":
                        ncols = int(i.text)

                    elif t == "NROWS":
                        nrows = int(i.text)

            elif tag == "Geoposition" and child.attrib.get("resolution") == "10":

                for i in child:

                    t = i.tag.split("}")[-1]

                    if t == "ULX":
                        ulx = float(i.text)

                    elif t == "ULY":
                        uly = float(i.text)

                    elif t == "XDIM":
                        xdim = float(i.text)

                    elif t == "YDIM":
                        ydim = float(i.text)

        if None not in (epsg, ulx, uly, xdim, ydim, ncols, nrows):

            return {
                "epsg": epsg,
                "ulx": ulx,
                "uly": uly,
                "xdim": xdim,
                "ydim": ydim,
                "ncols": ncols,
                "nrows": nrows,
            }

    raise Exception("Tile_Geocoding not found")


# ==========================================================
# BUILD FOOTPRINT POLYGON
# ==========================================================

def _build_polygon(meta):
    from shapely.geometry import Polygon
    from pyproj import Transformer

    ulx = meta["ulx"]
    uly = meta["uly"]

    xdim = meta["xdim"]
    ydim = meta["ydim"]

    ncols = meta["ncols"]
    nrows = meta["nrows"]

    urx = ulx + (ncols * xdim)
    lly = uly + (nrows * ydim)

    corners = [
        (ulx, uly),
        (urx, uly),
        (urx, lly),
        (ulx, lly),
        (ulx, uly),
    ]

    transformer = Transformer.from_crs(
        f"EPSG:{meta['epsg']}",
        "EPSG:4326",
        always_xy=True,
    )

    lonlat = [transformer.transform(x, y) for x, y in corners]

    return Polygon(lonlat)


# ==========================================================
# INTERSECTION CHECK
# ==========================================================

def check_zip_intersection(zip_path, india_shp, log_file):
    import geopandas as gpd

    xml_path = _find_mtd_xml_in_zip(zip_path)

    if not xml_path:
        return False

    xml_file = _extract_single_file(zip_path, xml_path)

    try:

        meta = _read_geocoding(xml_file)

        poly = _build_polygon(meta)

        india = gpd.read_file(india_shp)

        intersects = india.intersects(poly).any()

    finally:
        # Always delete temporary XML
        if os.path.exists(xml_file):
            os.remove(xml_file)

    status = "YES" if intersects else "NO"

    with open(log_file, "a") as f:
        f.write(
            f"{os.path.basename(zip_path)} | INTERSECTION_IN_INDIA = {status}\n"
        )

    return intersects