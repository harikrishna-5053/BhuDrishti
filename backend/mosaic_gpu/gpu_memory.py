import cupy as cp


def get_optimal_block_size():

    free_memory, total_memory = (
        cp.cuda.Device()
        .mem_info
    )


    free_gb = (
        free_memory /
        (1024**3)
    )


    total_gb = (
        total_memory /
        (1024**3)
    )


    print(
        f"GPU Memory Available: {free_gb:.2f} GB / {total_gb:.2f} GB"
    )


    # -----------------------------------------
    # Quadro P4000 / 8GB VRAM optimization
    # -----------------------------------------

    if free_gb >= 7:

        block = 8192


    elif free_gb >= 5:

        block = 6144


    elif free_gb >= 3:

        block = 4096


    elif free_gb >= 1.5:

        block = 2048


    else:

        block = 1024



    print(
        "Selected GPU block size:",
        block
    )


    return block