import os
from precheck_intersection import check_zip_intersection

# ==========================================================
# CONFIG
# ==========================================================

ZIP_DIR = "/home/student/Desktop/NRSC/Batch_SENTINEL/All_Zips"
INDIA_SHP = "/home/student/Desktop/NRSC/IndiaShapeFile/STATE_BDY_FIXED.shp"

LOG_DIR = os.path.join(ZIP_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

SUMMARY_LOG = os.path.join(LOG_DIR, "dataset_summary.txt")
INTERSECTION_LOG = os.path.join(LOG_DIR, "intersection_report.txt")

# Clear previous intersection log
open(INTERSECTION_LOG, "w").close()

# ==========================================================
# COUNTERS
# ==========================================================

total_zip = 0
l2a_count = 0
l1c_count = 0

l2a_inside_india = 0
l2a_outside_india = 0

# ==========================================================
# SCAN ZIP FILES
# ==========================================================

for root, dirs, files in os.walk(ZIP_DIR):

    # Skip generated folders
    dirs[:] = [d for d in dirs if d not in ("OUTPUT", "logs")]

    for f in files:

        if not f.endswith(".zip"):
            continue

        zip_path = os.path.join(root, f)

        total_zip += 1

        # -----------------------------
        # Level-2A
        # -----------------------------
        if "_STUBBAOJD_" in f:

            l2a_count += 1

            if check_zip_intersection(
                zip_path,
                INDIA_SHP,
                INTERSECTION_LOG
            ):
                l2a_inside_india += 1
            else:
                l2a_outside_india += 1

        # -----------------------------
        # Level-1C
        # -----------------------------
        elif "_STUBTAOJD_" in f:

            l1c_count += 1

# ==========================================================
# PRINT SUMMARY
# ==========================================================

summary = f"""
========== DATASET SUMMARY ==========
Total ZIP files              : {total_zip}
Total Level-2A ZIP files     : {l2a_count}
Total Level-1C ZIP files     : {l1c_count}
-------------------------------------
Level-2A Inside India        : {l2a_inside_india}
Level-2A Outside India       : {l2a_outside_india}
=====================================
"""

print(summary)

# ==========================================================
# SAVE SUMMARY
# ==========================================================

with open(SUMMARY_LOG, "w") as f:
    f.write(summary)

print(f"Summary Log      : {SUMMARY_LOG}")
print(f"Intersection Log : {INTERSECTION_LOG}")