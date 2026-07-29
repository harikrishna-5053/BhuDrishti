try:
    import numpy as np
except ImportError:
    np = None



def pixel_to_coordinate(
        geo_transform,
        px,
        py
):
    """
    Convert pixel position to map coordinates.
    """

    x = (
        geo_transform[0]
        +
        px * geo_transform[1]
        +
        py * geo_transform[2]
    )

    y = (
        geo_transform[3]
        +
        px * geo_transform[4]
        +
        py * geo_transform[5]
    )

    return x, y



def coordinate_to_pixel(
        geo_transform,
        x,
        y
):
    """
    Convert map coordinates to pixel position.
    """

    px = int(
        (x - geo_transform[0])
        /
        geo_transform[1]
    )

    py = int(
        (y - geo_transform[3])
        /
        geo_transform[5]
    )

    return px, py



def calculate_bounds(reader):
    """
    Convert complete raster extent into EPSG:4326.

    Returns:

    lon_min,
    lat_min,
    lon_max,
    lat_max

    """

    gt = reader.geoTransform


    width = reader.imageWidth

    height = reader.imageHeight



    corners = [

        (0,0),

        (width,0),

        (0,height),

        (width,height)

    ]



    longitudes = []

    latitudes = []



    for px,py in corners:


        x = (
            gt[0]
            +
            px * gt[1]
            +
            py * gt[2]
        )


        y = (
            gt[3]
            +
            px * gt[4]
            +
            py * gt[5]
        )



        lon,lat = reader.transformer.transform(
            x,
            y
        )


        longitudes.append(lon)

        latitudes.append(lat)



    return (

        min(longitudes),

        min(latitudes),

        max(longitudes),

        max(latitudes)

    )




def get_upper_left_latlon(reader):
    """
    Get the first pixel (0,0)
    coordinate in EPSG:4326.

    This is used for placement.
    """


    gt = reader.geoTransform


    x = gt[0]

    y = gt[3]



    lon,lat = reader.transformer.transform(
        x,
        y
    )


    return lon,lat





def calculate_pixel_position(
        current_lon,
        current_lat,
        canvas_min_lon,
        canvas_max_lat,
        xscale=0.00000898,
        yscale=0.00000898
):
    """
    Mentor formula:

    Column =
    (current_lon - min_lon)/xscale + 0.5


    Row =
    (max_lat - current_lat)/yscale + 0.5

    """


    col = int(

        (
            current_lon
            -
            canvas_min_lon
        )
        /
        xscale
        +
        0.5

    )



    row = int(

        (
            canvas_max_lat
            -
            current_lat
        )
        /
        yscale
        +
        0.5

    )


    return row,col





def check_overlap(
        bounds1,
        bounds2
):
    """
    Check overlap in EPSG:4326.
    """

    lon1_min,lat1_min,lon1_max,lat1_max = bounds1

    lon2_min,lat2_min,lon2_max,lat2_max = bounds2



    if lon1_max <= lon2_min or lon2_max <= lon1_min:

        return False



    if lat1_max <= lat2_min or lat2_max <= lat1_min:

        return False



    return True





def create_empty_array(
        width,
        height,
        nodata=-9999.0
):

    return np.full(

        (
            height,
            width
        ),

        nodata,

        dtype=np.float32

    )





def update_max_pixel(
        destination,
        source,
        nodata=-9999.0
):


    valid = source != nodata


    destination[valid] = np.maximum(

        destination[valid],

        source[valid]

    )


    return destination





def memory_size(array):

    return array.nbytes/(1024*1024)