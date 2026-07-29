import os
import re
from datetime import datetime

from .zone_manager import group_tiles_by_zone
from .mosaic_gpu import MosaicGPU
from .final_india_mosaic import create_india_mosaic


# -------------------------------------------------
# Extract Sentinel acquisition date
# -------------------------------------------------

def get_date_from_filename(filename):

    name = filename.upper()


    match = re.search(
        r'_(\d{8})T',
        name
    )


    if match:

        return datetime.strptime(
            match.group(1),
            "%Y%m%d"
        )


    return None



# -------------------------------------------------
# Convert date to 10 day period
# -------------------------------------------------

def get_period(date):

    day = date.day


    if day <= 10:

        return "01_10"


    elif day <=20:

        return "11_20"


    else:

        return "21_31"



# -------------------------------------------------
# Find NDVI TIFF files
# -------------------------------------------------

def collect_ndvi_files(root):

    files=[]

    for path,dirs,names in os.walk(root):

        dirs[:] = [
            d for d in dirs
            if d not in (
                "TEMP_MOSAIC",
                "FINAL"
            )
        ]

        for name in names:

            if (
                name.endswith(".tif")
                and
                "_NDVI.tif" in name
            ):

                files.append(
                    os.path.join(
                        path,
                        name
                    )
                )

    return files



# -------------------------------------------------
# Main processing
# -------------------------------------------------

def create_periodic_gpu_mosaics(
        input_folder):



    print(
        "\nScanning NDVI files..."
    )


    ndvi_files = collect_ndvi_files(
        input_folder
    )


    print(
        "Total NDVI files:",
        len(ndvi_files)
    )



    periods={

        "01_10":[],

        "11_20":[],

        "21_31":[]

    }



    # ----------------------------------
    # Group by date
    # ----------------------------------

    for file in ndvi_files:


        date = get_date_from_filename(

            os.path.basename(file)

        )


        if date is None:

            print(
                "Date missing:",
                file
            )

            continue



        period=get_period(date)



        periods[period].append(
            file
        )



    # ----------------------------------
    # Process each 10 day period
    # ----------------------------------

    for period,files in periods.items():


        zone_outputs = []

        if not files:

            continue



        print(
            "\n=========================="
        )

        print(
            "Processing period:",
            period
        )

        print(
            "Files:",
            len(files)
        )

        print(
            "=========================="
        )



        # --------------------------------
        # Separate UTM zones
        # --------------------------------

        zones = group_tiles_by_zone(
            files
        )



        for zone,zone_files in zones.items():



            print(
                "\nZONE:",
                zone
            )


            print(
                "Tiles:",
                len(zone_files)
            )



            output_dir=os.path.join(

                input_folder,

                "TEMP_MOSAIC",

                period

            )



            os.makedirs(

                output_dir,

                exist_ok=True

            )



            output_file=os.path.join(

                output_dir,

                f"ZONE_{zone}_{period}_NDVI_GPU.tif"

            )



            mosaic=MosaicGPU()



            mosaic.add_files(

                sorted(zone_files)

            )



            mosaic.set_output(

                output_file

            )



            mosaic.create()

            zone_outputs.append(output_file)



            print(

                "Completed Zone",

                zone

            )


            # --------------------------------
            # Create Full India Mosaic
            # --------------------------------

            india_dir = os.path.join(input_folder, "FINAL")
            os.makedirs(india_dir, exist_ok=True)

            india_output = os.path.join(
                india_dir,
                f"INDIA_{period}_NDVI.tif"
            )

            create_india_mosaic(
                zone_outputs,
                india_output
            )





if __name__=="__main__":



    create_periodic_gpu_mosaics(

        "/home/student/Desktop/NRSC/Batch_SENTINEL/All_Zips/OUTPUT"

    )