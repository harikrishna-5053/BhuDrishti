import math
class BlockManager:
    def __init__(
            self,
            width,
            height,
            block_size=4096):


        self.width = width

        self.height = height

        self.block_size = block_size



    def get_blocks(self):

        blocks=[]


        rows = math.ceil(
            self.height /
            self.block_size
        )


        cols = math.ceil(
            self.width /
            self.block_size
        )


        for row in range(rows):

            for col in range(cols):


                xoff = (
                    col *
                    self.block_size
                )


                yoff = (
                    row *
                    self.block_size
                )


                xsize = min(
                    self.block_size,
                    self.width-xoff
                )


                ysize = min(
                    self.block_size,
                    self.height-yoff
                )


                blocks.append(
                    (
                        xoff,
                        yoff,
                        xsize,
                        ysize
                    )
                )


        return blocks