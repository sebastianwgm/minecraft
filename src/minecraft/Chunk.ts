import { Mat3, Mat4, Vec2, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    private maxHeightOfField: number = 100; // maximum height for the range of frequencies heights
    private patchHeightMap: Float32Array;

    // Define interpolation filters
    private topLeft = new Float32Array([9, 3, 3, 1]);
    private topRight = new Float32Array([3, 9, 1, 3]);
    private bottomLeft = new Float32Array([3, 1, 9, 3]);
    private botoomRight = new Float32Array([1, 3, 3, 9]);
    
    constructor(centerX : number, centerY : number, size: number) {
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;     
        this.patchHeightMap = new Float32Array(size * size);   
        this.generateCubes(); 
    }

    public getValues(){
        return new Vec4([this.x, this.y, this.size, this.cubes]);
    }

    // Helper function to create a noise array given a seed, size, maxHeight, and scaleFactor
    public createNoiseArray(seed: string, size: number, maxHeight: number, scaleFactor: number): Float32Array {
        let rng: Rand = new Rand(seed);
        let array: Float32Array = new Float32Array(size * size);

        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const height = Math.floor(this.maxHeightOfField * rng.next());
                array[size * i + j] = height * scaleFactor;
            }
        }

        return array;
    }

    private a2x2ConvolutionKernel(kernel: Float32Array, matrix: Float32Array): Float32Array {
        let dim = Math.sqrt(matrix.length);
        if (dim % 1 !== 0) {
            throw new Error('PANIC: it is not a square matrix');
        }
        dim = Math.floor(dim);
        dim--;
        let newMatrix = new Float32Array(dim * dim);
        for (let i = 0; i < dim; i++) {
            for (let j = 0; j < dim; j++) {
                let idx = (dim + 1) * i + j;
                let value = kernel[0] * matrix[idx] + 
                            kernel[1] * matrix[idx + 1] + 
                            kernel[2] * matrix[idx + dim + 1] + 
                            kernel[3] * matrix[idx + dim + 2];
                newMatrix[dim * i + j] = value / 16;
            }
        }
        return newMatrix;
    }

    public computeNewValue(i: number, j: number, tLeftMat: Float32Array, tRightMat: Float32Array, bLeftMat: Float32Array, bRightMat: Float32Array, idx: number): number {
        // Determine which matrix to use based on the parity of i and j   
        if (i % 2 === 0 && j % 2 === 1)  {
            return tRightMat[idx]; // Top-Right matrix for even i, odd j
        } else if (i % 2 === 1 && j % 2 === 0) {
            return bLeftMat[idx];  // Bottom-Left matrix for odd i, even j
        } else if (i % 2 === 0 && j % 2 === 0) {
            return tLeftMat[idx];  // Top-Left matrix for even i, even j
        } else {
            return bRightMat[idx]; // Bottom-Right matrix for odd i, odd j
        }
    }

    public upsampleOnce(cubePositionsF32: Float32Array): Float32Array {
        const oldD = Math.sqrt(cubePositionsF32.length);
        const targetDim = (oldD - 2) * 2 + 2;
        let newCubePositionsF32Updated = new Float32Array(targetDim * targetDim);

        // 2x2 convolution kernels to the former array
        const topLeftMatrix = this.a2x2ConvolutionKernel(this.topLeft, cubePositionsF32);
        const topRightMatrix = this.a2x2ConvolutionKernel(this.topRight, cubePositionsF32);
        const bottomLeftMatrix = this.a2x2ConvolutionKernel(this.bottomLeft, cubePositionsF32);
        const bottomRightMatrix = this.a2x2ConvolutionKernel(this.botoomRight, cubePositionsF32);
        let dimention = Math.sqrt(bottomLeftMatrix.length);
        // Construct the new upscaled matrix
        // console.log("targetDim: ", targetDim);
        // console.log("newCubePositionsF32Updated before: ", newCubePositionsF32Updated);
        for (let i = 0; i < targetDim; i++) {
            for (let j = 0; j < targetDim; j++) {
                const idx = i * targetDim + j;
                const subMatrixIdx = Math.floor(i / 2) * dimention + Math.floor(j / 2);       
                newCubePositionsF32Updated[idx] = this.computeNewValue(i, j, topLeftMatrix, topRightMatrix, bottomLeftMatrix, bottomRightMatrix, subMatrixIdx);
            }
        }
        // console.log("newCubePositionsF32Updated after: ", newCubePositionsF32Updated);
        return newCubePositionsF32Updated;
    }
    
    
    // Helper function for terrain synthesis
    public terrainSynthesis(size: number, octave: number): Float32Array {
        // generate a random seed that depends on the size and position
        let seed = `${this.x} ${this.y} ${size}`;
        let rng = new Rand(seed);
        // going from 8x8 (64) to 10x10 (100), 4x4 to 6x6, 2x2 to 4x4 
        let newGridSizePad = size + 2;
        let cubePositionsF32TSyn: Float32Array = new Float32Array(newGridSizePad ** 2);
        // 1/8, 1/4, 1/2 for 3 octaves
        let coarseScale = ((1.0 / (size / this.size)) / (2 ** octave));

        // fill corresponding parts of the array with value noise following the starting code
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const height = Math.floor(rng.next() * this.maxHeightOfField);
                const idx = newGridSizePad * (i + 1) + j + 1;
                // we apply the mointain analogy
                cubePositionsF32TSyn[idx] = height * coarseScale;
            }
        }
        
        // for the others eight chunks (neighbors) we generate noises to fill padded parts
        // Define seeds for noise generation
        const positions = [
            { dx: -this.size, dy: 0 },      // Top
            { dx: this.size, dy: 0 },       // Bottom
            { dx: 0, dy: -this.size },      // Left
            { dx: 0, dy: this.size },       // Right
            { dx: this.size, dy: this.size },       // Bottom-Right
            { dx: this.size, dy: -this.size },      // Bottom-Left
            { dx: -this.size, dy: this.size },      // Top-Right
            { dx: -this.size, dy: -this.size }      // Top-Left
        ];

        const seeds: string[] = positions.map(pos => 
            `${this.x + pos.dx} ${this.y + pos.dy} ${size}`
        );

        // Generate noise arrays from seeds
        let valueNoiseArrays = seeds.map(seed => this.createNoiseArray(seed, size, this.maxHeightOfField, coarseScale));

        // TODO: confirm values and math
        const stride = size + 2; // The stride length in the cube positions array which includes borders
        // Top (Copying the bottom row of the top noise array to the top row of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = (size - 1) * size + i;  // last row, ith column in the noise array
            cubePositionsF32TSyn[i + 1] = valueNoiseArrays[0][sourceIdx];  // skip the first corner
        }
        // Bottom (Copying the top row of the bottom noise array to the bottom row of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            // i = first row, ith column in the noise array
            let sourceIdx = stride * (size + 1) + i + 1;
            cubePositionsF32TSyn[sourceIdx] = valueNoiseArrays[1][i];
        }
        // Left (Copying the right column of the left noise array to the left column of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = i * size + (size - 1);  // ith row, last column in the noise array
            cubePositionsF32TSyn[(i + 1) * stride] = valueNoiseArrays[2][sourceIdx];
        }
        // Right (Copying the left column of the right noise array to the right column of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = i * size;  // ith row, first column in the noise array
            cubePositionsF32TSyn[(i + 1) * stride + (size + 1)] = valueNoiseArrays[3][sourceIdx];
        }
        cubePositionsF32TSyn[0] = valueNoiseArrays[7][size * size - 1]; // TopLeft (last element of TopLeft noise array)
        cubePositionsF32TSyn[size + 1] = valueNoiseArrays[6][size * (size - 1)]; // TopRight (last row, first column of TopRight noise array)
        cubePositionsF32TSyn[stride * (size + 1)] = valueNoiseArrays[5][size - 1]; // BottomLeft (first row, last column of BottomLeft noise array)
        cubePositionsF32TSyn[stride ** 2 - 1] = valueNoiseArrays[4][0]; // BottomRight (first element of BottomRight noise array)
        
        // console.log("cubePositionsF32TSyn: ", cubePositionsF32TSyn);
        // Unsampling noise by bilinear interpolations, power of 2 grid
        // unsampling factor will be: log_2 of 8, 16, 32 = 3, 4, 5
        let factorToUnsample = Math.floor(Math.log2((this.size / size)));
        // TODO: confirm math
        // Perform upsampling using 2x2 kernels
        for (let i = 0; i < factorToUnsample; i++) {
            // console.log("cubePositionsF32TSyn before: ", cubePositionsF32TSyn);
            cubePositionsF32TSyn = this.upsampleOnce(cubePositionsF32TSyn);
            // console.log("cubePositionsF32TSyn after: ", cubePositionsF32TSyn);
        }
        
        let finalReturnedArray: Float32Array = new Float32Array(this.size * this.size);
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                let returnIndex = i * this.size + j;
                let sourceIndex = (i + 1) * (this.size + 2) + (j + 1);
                finalReturnedArray[returnIndex] = cubePositionsF32TSyn[sourceIndex];
            }
        }

        return finalReturnedArray;
    }
    private numberOfCubesToDraw(arr: Float32Array, i: number, j: number, height: number): number {
        if (!(i !== 0 && j !== 0 && i !== this.size - 1 && j !== this.size - 1)) {
            return height;
        } else {
            const size = this.size;
            const idx = size * i + j;  // current index
        
            // Check boundaries and compute indices safely (just in case)
            const indexUp = i > 0 ? size * (i - 1) + j : idx;
            const indexDown = i < size - 1 ? size * (i + 1) + j : idx;
            const indexLeft = j > 0 ? size * i + (j - 1) : idx;
            const indexRight = j < size - 1 ? size * i + (j + 1) : idx;
        
            // Array of the current and neighboring heights
            const heights = [
                arr[idx],       // Current
                arr[indexUp],     // Up
                arr[indexDown],   // Down
                arr[indexLeft],   // Left
                arr[indexRight]   // Right
            ];
        
            // Find the minimum height around the current cube
            const minNeigh = Math.min(...heights);
        
            // Calculate the number of cubes drawn
            return Math.floor(arr[idx] - minNeigh + 1);
        }
        
    }

    private generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        
        // TODO: The real landscape-generation logic. 
        // The example code below shows you how to use the pseudorandom number generator to create a few cubes.
        this.cubes = this.size * this.size;

        // As stated by the milestone, we start by using 3 octaves
        let octave = 3;
        for(let i = 0; i < octave; i++) {
            // get the width of the block for each octave, 8, 4, 2
            let widthOfBlock: number = Math.floor((this.size) / (2 ** (i + 3)));
            let valuesNoise: Float32Array = this.terrainSynthesis(widthOfBlock, (octave + 3));
            // Add generated noise values to the heightMap, ensuring to be in the range 0-100
            this.patchHeightMap = this.patchHeightMap.map((currentHeight: number, idx: number) => {
                // TODO: confirm maybe?
                return Math.floor(Math.min(Math.max((currentHeight + valuesNoise[idx]), 0), 100)); // Clamps the values between 0 and 100
            });
        }

        // console.log("patchHeightMap 1: ", this.patchHeightMap);
        // TODO: maybe use 3D Perlin noise to generate true volumetric terrain, with cavern systems, 
        // ore veins, and overhangs.
        let numberOfCubes = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const idx = this.size * i + j;
                const height = Math.floor(this.patchHeightMap[idx]);
                numberOfCubes += this.numberOfCubesToDraw(this.patchHeightMap, i, j, height);
            }
        }
        // Pass the cubes to be drawn
        this.cubes = numberOfCubes;
        this.cubePositionsF32 = new Float32Array(4 * numberOfCubes);
        let position = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = Math.floor(this.patchHeightMap[this.size * i + j]);
                const numCubes = this.numberOfCubesToDraw(this.patchHeightMap, i, j, height);
                for (let k = 0; k < numCubes; k++) {
                    const baseIndex = 4 * position;
                    this.cubePositionsF32[baseIndex] = topleftx + j;
                    this.cubePositionsF32[baseIndex + 1] = height - k;
                    this.cubePositionsF32[baseIndex + 2] = toplefty + i;
                    this.cubePositionsF32[baseIndex + 3] = 0;
                    position++;
                }
            }
        }
    }
    
    // TODO: check logic/math
    // Check if the player new position goes inside any cube
    public lateralCheck(newPosition: Vec3, radius: number, maxHeightToCheck: number): boolean {
        const topLeftX = this.x - this.size / 2;
        const topLeftZ = this.y - this.size / 2;
        const playerTopY = newPosition.y - maxHeightToCheck;

        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                const testPointX = (offsetX == 0) ? newPosition.x : Math.round(newPosition.x) - 0.5 + offsetX;
                const testPointZ = (offsetZ == 0) ? newPosition.z : Math.round(newPosition.z) - 0.5 + offsetZ;

                let testingPoint = new Vec2([testPointX, testPointZ]);
                let newOffsetX = (offsetX == -1) ? 1 : 0;
                let newOffsetZ = (offsetZ == -1) ? 1 : 0
                testingPoint.add(new Vec2([newOffsetX, newOffsetZ]));

                const dist = Vec2.distance(testingPoint, new Vec2([newPosition.x, newPosition.z]));

                if (dist < radius) {
                    const gridX = Math.round(testPointX - topLeftX) + offsetX;
                    const gridZ = Math.round(testPointZ - topLeftZ) + offsetZ;

                    if (gridX >= 0 && gridZ >= 0 && gridX < this.size && gridZ < this.size) {
                        const idx = gridX * this.size + gridZ;
                        const height = Math.floor(this.patchHeightMap[idx]);
                        if (playerTopY < height) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    // augment the Chunk class with logic for determining the minimum vertical position
    // TODO: confirm if isAscending is helpful for something
    // public minimumVerticalPosition(newPosition: Vec3, radius: number, maxHeightToCheck: number, isAscending: boolean): number{
    public minimumVerticalPosition(newPosition: Vec3, maxHeightToCheck: number): number{
        const topLeftX = this.x - this.size / 2;
        const topLeftY = this.y - this.size / 2;
        // Calculate adjusted positions relative to chunk coordinates
        const adjustedX = Math.round(newPosition.x - topLeftX);
        const adjustedY = Math.round(newPosition.z - topLeftY);
        // Early boundary check to return quickly for out-of-bound coordinates
        if (!(adjustedX >= 0 && adjustedY >= 0 && adjustedX < this.size && adjustedY < this.size)) {
            return Number.MIN_SAFE_INTEGER;
        }
        const idx = adjustedX * this.size + adjustedY;
        const baseY = newPosition.y - maxHeightToCheck;
        const height = Math.floor(this.patchHeightMap[idx]);
        if (baseY >= height) {
            return Number.MIN_SAFE_INTEGER;
        } else {
            return height;
        }
        // TODO: Check for vertical collisions based on direction of movement?
        // if (isAscending) {
        //     return this.checkAscendingCollision(idx, baseY, maxHeightToCheck);
        // } else {
        //     return this.checkDescendingCollision(idx, topY, maxHeightToCheck);
        // }
    }

    // private checkAscendingCollision(index: number, baseY: number, maxHeightToCheck: number): number {
    //     for (let i = 0; i <= maxHeightToCheck; i++) {
    //         const height = this.patchHeightMap[index];
            
    //         if (baseY + i + 1 < this.densityMap[index].length && this.densityMap[index][baseY + i + 1] >= 0) {
    //             return baseY + i + 1 - Config.PLAYER_HEIGHT - 0.5;
    //         }
    //     }
    //     return Number.MIN_SAFE_INTEGER;
    // }
    
    // private checkDescendingCollision(index: number, topY: number, maxHeightToCheck: number): number {
    //     for (let i = 0; i <= maxHeightToCheck; i++) {
    //         if (topY - i < this.densityMap[index].length && this.densityMap[index][topY - i] >= 0) {
    //             return topY - i + 0.5;
    //         }
    //     }
    //     return Number.MIN_SAFE_INTEGER;
    // }

    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }

    public numCubes(): number {
        return this.cubes;
    }
}
