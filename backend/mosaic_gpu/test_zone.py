from zone_manager import group_tiles_by_zone


files = [

"/path/T43QGC_NDVI.tif",

"/path/T44QPC_NDVI.tif",

"/path/T45QTC_NDVI.tif"

]


zones = group_tiles_by_zone(files)


for zone,tiles in zones.items():

    print(
        "ZONE:",
        zone
    )

    for t in tiles:

        print(
            "   ",
            t
        )
        