import os

# ==========================================================
# FIND SAFE PRODUCTS
# ==========================================================

def find_safe_products(base_input_root, logger=None):

    safe_products = []

    # ======================================================
    # SCAN DIRECTORY TREE
    # ======================================================

    for root, dirs, files in os.walk(base_input_root):

        for d in dirs:

            if not d.endswith(".SAFE"):
                continue

            safe_path = os.path.join(root, d)

            # ==================================================
            # BASIC VALIDATION (light check only)
            # ==================================================

            if not os.path.isdir(safe_path):
                continue

            safe_products.append(safe_path)
    # ======================================================
    # REPORT (MINIMAL)
    # ======================================================

    print(f"SAFE Products Found: {len(safe_products)}")

    if logger:
        logger.info(f"SAFE Products Found: {len(safe_products)}")

    # ======================================================
    # SAFETY CHECK
    # ======================================================

    if len(safe_products) == 0:

        error_msg = "No SAFE products found in extracted data"

        if logger:
            logger.error(error_msg)

        raise Exception(error_msg)

    return safe_products