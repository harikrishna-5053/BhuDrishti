import os
import math
import cupy as cp

from .geotiff_reader_gpu import GeoTiffReader
from .geotiff_writer_gpu import GeoTiffWriter
from .block_manager import BlockManager
from .gpu_processor import GPUProcessor
from .gpu_memory import get_optimal_block_size



class MosaicGPU:


    def __init__(self):

        self.files = []

        self.output = ""

        self.resolution = None

        self.projection = None

        self.geo_transform = None

        self.bounds = None

        self.width = 0

        self.height = 0

        self.gpu = GPUProcessor()



        # Keep readers open
        self.readers = []



    # -------------------------------------------------
    # Input files
    # -------------------------------------------------

    def add_files(self, files):

        self.files = files



    def set_output(self, output):

        self.output = output



    # -------------------------------------------------
    # Open all GeoTIFFs once
    # -------------------------------------------------

    def open_readers(self):

        print("\nOpening GeoTIFF files...")


        for file in self.files:

            reader = GeoTiffReader()

            reader.open(file)

            self.readers.append(reader)



        print(
            "Opened:",
            len(self.readers),
            "tiles"
        )



    # -------------------------------------------------
    # Close readers
    # -------------------------------------------------

    def close_readers(self):

        for reader in self.readers:

            reader.close()


        self.readers=[]



    # -------------------------------------------------
    # Calculate mosaic extent
    # -------------------------------------------------

    def calculate_extent(self):


        xmin=float("inf")

        ymin=float("inf")

        xmax=float("-inf")

        ymax=float("-inf")



        for reader in self.readers:


            bounds = reader.get_bounds()



            xmin=min(
                xmin,
                bounds[0]
            )


            ymin=min(
                ymin,
                bounds[1]
            )


            xmax=max(
                xmax,
                bounds[2]
            )


            ymax=max(
                ymax,
                bounds[3]
            )



            if self.resolution is None:


                self.resolution = (
                    reader.pixel_size_x
                )


                self.projection = (
                    reader.projection
                )


                self.geo_transform = (
                    reader.geo_transform
                )



        self.bounds=(

            xmin,
            ymin,
            xmax,
            ymax

        )



        self.width=math.ceil(

            (xmax-xmin)
            /
            self.resolution

        )



        self.height=math.ceil(

            (ymax-ymin)
            /
            self.resolution

        )



        print(
            "Mosaic size:",
            self.width,
            "x",
            self.height
        )



    # -------------------------------------------------
    # Calculate tile offset
    # -------------------------------------------------

    def get_offset(self,bounds):


        xmin,ymin,xmax,ymax=self.bounds


        tile_x=bounds[0]

        tile_y=bounds[3]



        xoff=round(

            (tile_x-xmin)
            /
            self.resolution

        )


        yoff=round(

            (ymax-tile_y)
            /
            self.resolution

        )


        return xoff,yoff




    # -------------------------------------------------
    # GPU Mosaic
    # -------------------------------------------------

    def create(self):


        try:


            self.open_readers()



            print(
                "\nCalculating extent..."
            )


            self.calculate_extent()



            block_size = (
                get_optimal_block_size()
            )


            print(
                "Using block size:",
                block_size
            )



            writer=GeoTiffWriter()



            xmin,ymin,xmax,ymax=self.bounds



            output_transform=(

                xmin,

                self.resolution,

                0,

                ymax,

                0,

                -self.resolution

            )



            writer.create(

                self.output,

                self.width,

                self.height,

                self.projection,

                output_transform

            )



            block_manager=BlockManager(

                self.width,

                self.height,

                block_size

            )


            blocks=(
                block_manager.get_blocks()
            )



            print(
                "Total blocks:",
                len(blocks)
            )



            # ---------------------------------
            # Process blocks
            # ---------------------------------

            for block in blocks:


                bx,by,bw,bh=block



                print(
                    "Processing block:",
                    bx,
                    by,
                    bw,
                    bh
                )



                gpu_block=self.gpu.create_empty(

                    bh,

                    bw

                )



                # -----------------------------
                # Process tiles
                # -----------------------------

                for reader in self.readers:



                    tile_bounds=(
                        reader.get_bounds()
                    )



                    tx,ty=self.get_offset(

                        tile_bounds

                    )



                    # block intersection


                    if (

                        tx+bw <= bx
                        or
                        bx+bw <= tx
                        or
                        ty+bh <= by
                        or
                        by+bh <= ty

                    ):

                        continue



                    local_x=max(

                        0,

                        bx-tx

                    )


                    local_y=max(

                        0,

                        by-ty

                    )



                    read_width=min(

                        bw,

                        reader.width-local_x

                    )


                    read_height=min(

                        bh,

                        reader.height-local_y

                    )



                    if (

                        read_width<=0
                        or
                        read_height<=0

                    ):

                        continue




                    data=reader.read_block(

                        local_x,

                        local_y,

                        read_width,

                        read_height

                    )



                    gpu_data=cp.asarray(

                        data

                    )



                    gx=tx+local_x-bx

                    gy=ty+local_y-by



                    # -----------------------------
                    # FINAL SAFETY CHECK
                    # -----------------------------

                    end_x=min(

                        gx+read_width,

                        bw

                    )


                    end_y=min(

                        gy+read_height,

                        bh

                    )



                    valid_width=end_x-gx

                    valid_height=end_y-gy



                    if (

                        valid_width<=0
                        or
                        valid_height<=0

                    ):

                        continue



                    gpu_data=gpu_data[

                        :valid_height,

                        :valid_width

                    ]



                    target=gpu_block[

                        gy:end_y,

                        gx:end_x

                    ]



                    self.gpu.merge_max(

                        target,

                        gpu_data

                    )



                # -----------------------------
                # Write block
                # -----------------------------

                cpu_block=(

                    self.gpu.gpu_to_cpu(

                        gpu_block

                    )

                )



                writer.write_block(

                    cpu_block,

                    bx,

                    by

                )



                del gpu_block

                cp.get_default_memory_pool().free_all_blocks()



            writer.close()



            print(
                "\nGPU Mosaic Completed:"
            )


            print(
                self.output
            )



        finally:


            self.close_readers()