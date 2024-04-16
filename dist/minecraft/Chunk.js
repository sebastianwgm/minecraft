import Rand from "../lib/rand-seed/Rand.js";
export class Chunk {
    constructor(centerX, centerY, size) {
        this.maxHeightOfField = 100; // maximum height for the range of frequencies heights
        // Define interpolation filters
        this.topLeft = new Float32Array([9, 3, 3, 1]);
        this.topRight = new Float32Array([3, 9, 1, 3]);
        this.bottomLeft = new Float32Array([3, 1, 9, 3]);
        this.botoomRight = new Float32Array([1, 3, 3, 9]);
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size * size;
        this.patchHeightMap = new Float32Array(size * size);
        this.generateCubes();
    }
    // Helper function to create a noise array given a seed, size, maxHeight, and scaleFactor
    createNoiseArray(seed, size, maxHeight, scaleFactor) {
        let rng = new Rand(seed);
        let array = new Float32Array(size * size);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const height = Math.floor(this.maxHeightOfField * rng.next());
                array[size * i + j] = height * scaleFactor;
            }
        }
        return array;
    }
    a2x2ConvolutionKernel(kernel, matrix) {
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
    computeNewValue(i, j, tLeftMat, tRightMat, bLeftMat, bRightMat, idx) {
        // Determine which matrix to use based on the parity of i and j   
        if (i % 2 === 0 && j % 2 === 1) {
            return tRightMat[idx]; // Top-Right matrix for even i, odd j
        }
        else if (i % 2 === 1 && j % 2 === 0) {
            return bLeftMat[idx]; // Bottom-Left matrix for odd i, even j
        }
        else if (i % 2 === 0 && j % 2 === 0) {
            return tLeftMat[idx]; // Top-Left matrix for even i, even j
        }
        else {
            return bRightMat[idx]; // Bottom-Right matrix for odd i, odd j
        }
    }
    upsampleOnce(cubePositionsF32) {
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
        console.log("targetDim: ", targetDim);
        console.log("newCubePositionsF32Updated before: ", newCubePositionsF32Updated);
        for (let i = 0; i < targetDim; i++) {
            for (let j = 0; j < targetDim; j++) {
                const idx = i * targetDim + j;
                const subMatrixIdx = Math.floor(i / 2) * dimention + Math.floor(j / 2);
                newCubePositionsF32Updated[idx] = this.computeNewValue(i, j, topLeftMatrix, topRightMatrix, bottomLeftMatrix, bottomRightMatrix, subMatrixIdx);
            }
        }
        console.log("newCubePositionsF32Updated after: ", newCubePositionsF32Updated);
        return newCubePositionsF32Updated;
    }
    // Helper function for terrain synthesis
    terrainSynthesis(size, octave) {
        // generate a random seed that depends on the size and position
        let seed = `${this.x} ${this.y} ${size}`;
        let rng = new Rand(seed);
        // going from 8x8 (64) to 10x10 (100), 4x4 to 6x6, 2x2 to 4x4 
        let newGridSizePad = size + 2;
        let cubePositionsF32TSyn = new Float32Array(Math.pow(newGridSizePad, 2));
        // 1/8, 1/4, 1/2 for 3 octaves
        let coarseScale = ((1.0 / (size / this.size)) / (Math.pow(2, octave)));
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
            { dx: -this.size, dy: 0 }, // Top
            { dx: this.size, dy: 0 }, // Bottom
            { dx: 0, dy: -this.size }, // Left
            { dx: 0, dy: this.size }, // Right
            { dx: this.size, dy: this.size }, // Bottom-Right
            { dx: this.size, dy: -this.size }, // Bottom-Left
            { dx: -this.size, dy: this.size }, // Top-Right
            { dx: -this.size, dy: -this.size } // Top-Left
        ];
        const seeds = positions.map(pos => `${this.x + pos.dx} ${this.y + pos.dy} ${size}`);
        // Generate noise arrays from seeds
        let valueNoiseArrays = seeds.map(seed => this.createNoiseArray(seed, size, this.maxHeightOfField, coarseScale));
        // TODO: confirm values and math
        const stride = size + 2; // The stride length in the cube positions array which includes borders
        // Top (Copying the bottom row of the top noise array to the top row of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = (size - 1) * size + i; // last row, ith column in the noise array
            cubePositionsF32TSyn[i + 1] = valueNoiseArrays[0][sourceIdx]; // skip the first corner
        }
        // Bottom (Copying the top row of the bottom noise array to the bottom row of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            // i = first row, ith column in the noise array
            let sourceIdx = stride * (size + 1) + i + 1;
            cubePositionsF32TSyn[sourceIdx] = valueNoiseArrays[1][i];
        }
        // Left (Copying the right column of the left noise array to the left column of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = i * size + (size - 1); // ith row, last column in the noise array
            cubePositionsF32TSyn[(i + 1) * stride] = valueNoiseArrays[2][sourceIdx];
        }
        // Right (Copying the left column of the right noise array to the right column of the cube positions, excluding corners)
        for (let i = 0; i < size; i++) {
            let sourceIdx = i * size; // ith row, first column in the noise array
            cubePositionsF32TSyn[(i + 1) * stride + (size + 1)] = valueNoiseArrays[3][sourceIdx];
        }
        cubePositionsF32TSyn[0] = valueNoiseArrays[7][size * size - 1]; // TopLeft (last element of TopLeft noise array)
        cubePositionsF32TSyn[size + 1] = valueNoiseArrays[6][size * (size - 1)]; // TopRight (last row, first column of TopRight noise array)
        cubePositionsF32TSyn[stride * (size + 1)] = valueNoiseArrays[5][size - 1]; // BottomLeft (first row, last column of BottomLeft noise array)
        cubePositionsF32TSyn[Math.pow(stride, 2) - 1] = valueNoiseArrays[4][0]; // BottomRight (first element of BottomRight noise array)
        console.log("cubePositionsF32TSyn: ", cubePositionsF32TSyn);
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
        let finalReturnedArray = new Float32Array(this.size * this.size);
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                let returnIndex = i * this.size + j;
                let sourceIndex = (i + 1) * (this.size + 2) + (j + 1);
                finalReturnedArray[returnIndex] = cubePositionsF32TSyn[sourceIndex];
            }
        }
        return finalReturnedArray;
    }
    numberOfCubesToDraw(arr, i, j, height) {
        if (!(i !== 0 && j !== 0 && i !== this.size - 1 && j !== this.size - 1)) {
            return height;
        }
        else {
            const size = this.size;
            const idx = size * i + j; // current index
            // Check boundaries and compute indices safely (just in case)
            const indexUp = i > 0 ? size * (i - 1) + j : idx;
            const indexDown = i < size - 1 ? size * (i + 1) + j : idx;
            const indexLeft = j > 0 ? size * i + (j - 1) : idx;
            const indexRight = j < size - 1 ? size * i + (j + 1) : idx;
            // Array of the current and neighboring heights
            const heights = [
                arr[idx], // Current
                arr[indexUp], // Up
                arr[indexDown], // Down
                arr[indexLeft], // Left
                arr[indexRight] // Right
            ];
            // Find the minimum height around the current cube
            const minNeigh = Math.min(...heights);
            // Calculate the number of cubes drawn
            return Math.floor(arr[idx] - minNeigh + 1);
        }
    }
    generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        // TODO: The real landscape-generation logic. 
        // The example code below shows you how to use the pseudorandom number generator to create a few cubes.
        this.cubes = this.size * this.size;
        // As stated by the milestone, we start by using 3 octaves
        let octave = 3;
        for (let i = 0; i < octave; i++) {
            // get the width of the block for each octave, 8, 4, 2
            let widthOfBlock = Math.floor((this.size) / (Math.pow(2, (i + 3))));
            let valuesNoise = this.terrainSynthesis(widthOfBlock, (octave + 3));
            // Add generated noise values to the heightMap, ensuring to be in the range 0-100
            this.patchHeightMap = this.patchHeightMap.map((currentHeight, idx) => {
                // TODO: confirm maybe?
                return Math.floor(Math.min(Math.max((currentHeight + valuesNoise[idx]), 0), 100)); // Clamps the values between 0 and 100
            });
        }
        console.log("patchHeightMap 1: ", this.patchHeightMap);
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
        console.log("patchHeightMap 2: ", this.patchHeightMap);
        // Pass the cubes to be drawn
        this.cubes = numberOfCubes;
        console.log("total cubes: ", numberOfCubes);
        console.log("thiscubes: ", this.cubes);
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
    cubePositions() {
        return this.cubePositionsF32;
    }
    numCubes() {
        return this.cubes;
    }
}
//# sourceMappingURL=Chunk.js.map