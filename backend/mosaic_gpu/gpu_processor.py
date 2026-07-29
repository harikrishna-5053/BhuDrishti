import cupy as cp



class GPUProcessor:


    def __init__(self):

        self.nodata = -9999



    def create_empty(
            self,
            height,
            width):


        return cp.full(

            (height,width),

            self.nodata,

            dtype=cp.float32

        )



    def merge_max(
            self,
            mosaic,
            tile):


        valid = (

            tile != self.nodata

        )


        mosaic[valid] = cp.maximum(

            mosaic[valid],

            tile[valid]

        )


        return mosaic



    def merge_median(
            self,
            stack):


        stack = cp.where(

            stack == self.nodata,

            cp.nan,

            stack

        )


        result = cp.nanmedian(

            stack,

            axis=0

        )


        result = cp.where(

            cp.isnan(result),

            self.nodata,

            result

        )


        return result



    def gpu_to_cpu(
            self,
            array):


        return cp.asnumpy(
            array
        )