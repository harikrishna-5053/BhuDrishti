import logging
import os


# ==========================================================
# LOGGER SETUP (SINGLETON STYLE)
# ==========================================================

def setup_logger(log_directory, log_name="ndvi_pipeline.log"):

    os.makedirs(log_directory, exist_ok=True)

    log_file = os.path.join(log_directory, log_name)

    logger = logging.getLogger("NRSC_NDVI_PIPELINE")

    logger.setLevel(logging.INFO)

    # ======================================================
    # AVOID DUPLICATE HANDLERS (IMPORTANT FOR BATCH RUNS)
    # ======================================================

    if logger.hasHandlers():
        logger.handlers.clear()

    # ======================================================
    # FILE HANDLER
    # ======================================================

    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s"
    )

    file_handler.setFormatter(formatter)

    logger.addHandler(file_handler)

    return logger
    