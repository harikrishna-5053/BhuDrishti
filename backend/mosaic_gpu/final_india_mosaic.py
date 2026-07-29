from osgeo import gdal
import os



INDIA_CRS = "EPSG:7755"



def reproject_zone_mosaic(
        input_file,
        output_file):


    print(
        "\nTransforming:"
    )

    print(
        input_file
    )


    options = gdal.WarpOptions(

        dstSRS=INDIA_CRS,

        resampleAlg="near",

        format="GTiff",

        creationOptions=[

            "TILED=YES",

            "COMPRESS=DEFLATE",

            "PREDICTOR=3",

            "BIGTIFF=YES"

        ]

    )


    gdal.Warp(

        output_file,

        input_file,

        options=options

    )


    print(
        "Created:"
    )

    print(
        output_file
    )




# ---------------------------------------
# Merge India projection files
# ---------------------------------------

def create_india_mosaic(
        zone_files,
        output_file):


    temp_files=[]



    temp_dir="india_temp"

    os.makedirs(
        temp_dir,
        exist_ok=True
    )



    # ----------------------------
    # Reproject zone mosaics
    # ----------------------------


    for i,file in enumerate(zone_files):


        out=os.path.join(

            temp_dir,

            f"zone_{i}.tif"

        )


        reproject_zone_mosaic(

            file,

            out

        )


        temp_files.append(
            out
        )



    print(
        "\nBuilding India mosaic..."
    )



    vrt="india.vrt"



    gdal.BuildVRT(

        vrt,

        temp_files

    )



    gdal.Translate(

        output_file,

        vrt,

        creationOptions=[

            "TILED=YES",

            "COMPRESS=DEFLATE",

            "PREDICTOR=3",

            "BIGTIFF=YES"

        ]

    )



    print(
        "\nIndia mosaic completed:"
    )


    print(
        output_file
    )


if __name__=="__main__":



    zones=[


    "TEMP_MOSAIC/01_10/ZONE_43_01_10_NDVI_GPU.tif",


    "TEMP_MOSAIC/01_10/ZONE_44_01_10_NDVI_GPU.tif",


    "TEMP_MOSAIC/01_10/ZONE_45_01_10_NDVI_GPU.tif"


    ]



    india_temp="india_temp_mosaic.tif"



    final_output="INDIA_NDVI_01_10_2026.tif"



    create_india_mosaic(

        zones,

        india_temp

    )



    clip_india_boundary(

        india_temp,

        "STATE_BDY_FIXED.shp",

        final_output

    )