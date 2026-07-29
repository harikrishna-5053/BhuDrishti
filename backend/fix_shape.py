import geopandas as gpd


input_file = (
    "/home/student/Desktop/NRSC/"
    "IndiaShapeFile/"
    "STATE_BDY_FIXED.shp"
)


output_file = (
    "/home/student/Desktop/NRSC/"
    "IndiaShapeFile/"
    "STATE_BDY_FIXED.shp"
)


print("Reading shapefile...")

gdf = gpd.read_file(input_file)


print(
    "Features:",
    len(gdf)
)


print(
    "Checking geometry..."
)


invalid = (
    ~gdf.geometry.is_valid
).sum()


print(
    "Invalid geometries:",
    invalid
)


print(
    "Repairing..."
)


gdf["geometry"] = (
    gdf.geometry.buffer(0)
)


print(
    "Saving fixed shapefile..."
)


gdf.to_file(
    output_file
)


print(
    "DONE:"
)

print(output_file)