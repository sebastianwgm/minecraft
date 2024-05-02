import { Mat3, Mat4, Quat, Vec2, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"
import { Lsystems, TreeBranch } from "./LSystemsFractals.js";

const perlin3D = true;
const seed = 10.0;

const vecsAdd = [new Vec3([0.0, 0.0, 0.0]),  //0
                    new Vec3([0.0, 0.0, 1.0]), //1
                    new Vec3([0.0, 1.0, 0.0]), //2 
                    new Vec3([0.0, 1.0, 1.0]), //3
                    new Vec3([1.0, 0.0, 0.0]), //4
                    new Vec3([1.0, 0.0, 1.0]), //5
                    new Vec3([1.0, 1.0, 0.0]), //6
                    new Vec3([1.0, 1.0, 1.0])]; //7

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private origCubes: number;
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private cubeTypesF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    private maxHeightOfField: number = 100; // maximum height for the range of frequencies heights
    private patchHeightMap: Float32Array;
    private opacities: {};
    private cubePositionToHighlight: number;
    private lSystem1: Lsystems;
    private lSystem2: Lsystems;
    private playerPosition: Vec3;
    private goldenCubesCount: number; // to count the number of golden cubes

    // Define interpolation filters
    private topLeft = new Float32Array([9, 3, 3, 1]);
    private topRight = new Float32Array([3, 9, 1, 3]);
    private bottomLeft = new Float32Array([3, 1, 9, 3]);
    private botoomRight = new Float32Array([1, 3, 3, 9]);
    
    constructor(centerX : number, centerY : number, size: number, playerPos: Vec3, lSystem1: Lsystems, lSystem2: Lsystems) {
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubePositionToHighlight = 0;
        this.cubes = size*size;     
        this.patchHeightMap = new Float32Array(size * size);
        this.opacities = {};
        this.playerPosition = playerPos;
        this.lSystem1 = lSystem1;
        this.lSystem2 = lSystem2;
        this.generateCubes(); 
        this.goldenCubesCount = 0;
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
        for (let i = 0; i < targetDim; i++) {
            for (let j = 0; j < targetDim; j++) {
                const idx = i * targetDim + j;
                const subMatrixIdx = Math.floor(i / 2) * dimention + Math.floor(j / 2);       
                newCubePositionsF32Updated[idx] = this.computeNewValue(i, j, topLeftMatrix, topRightMatrix, bottomLeftMatrix, bottomRightMatrix, subMatrixIdx);
            }
        }
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
        
        // Unsampling noise by bilinear interpolations, power of 2 grid
        // unsampling factor will be: log_2 of 8, 16, 32 = 3, 4, 5
        let factorToUnsample = Math.floor(Math.log2((this.size / size)));
        // Perform upsampling using 2x2 kernels
        for (let i = 0; i < factorToUnsample; i++) {
            cubePositionsF32TSyn = this.upsampleOnce(cubePositionsF32TSyn);
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
        let numCubes = 0;
        const idx = this.size * i + j;
        for (let k = 0; k < height; k++) {
            if (this.drawAtK(i, j, k, height)) {
                numCubes++;
            }
        }
        return numCubes;
    }

    private drawAtK(i: number, j: number, k: number, height: number): boolean {
        const idx = this.size * i + j;
        if (this.opacities[idx][k]< 0) {
            return false;
        }
        if (i == 0 || j == 0 || i == (this.size-1) || j== (this.size-1) || (k == 0) || (k == (height-1))) {
            return true;
        }
        // Check if it's uncovered on any side, so we need to draw it
        if (this.opacities[idx-this.size][k] < 0
            || this.opacities[idx+this.size][k] < 0
            || this.opacities[idx-1][k] < 0
            || this.opacities[idx+1][k] < 0
            || this.opacities[idx][k-1] < 0
            || this.opacities[idx][k+1] < 0) {

            return true;
        }
        return false;
    }

    private generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        
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
                return Math.floor(Math.min(Math.max((currentHeight + valuesNoise[idx]), 0), 100)); // Clamps the values between 0 and 100
            });
        }

        this.opacities = {};
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const idx = this.size * i + j;
                const height = this.patchHeightMap[idx]; 
                this.opacities[idx] = new Float32Array(height);
                let maxHeight = 0;
                for (let k=0; k < height; k++) {
                    // 3D Perlin noise
                    if (perlin3D) {
                        this.opacities[idx][k] = this.perlin3DNoise(i,j,k, topleftx, toplefty);
                    }
                    else {
                        this.opacities[idx][k] = 1;
                    }
                    if (this.opacities[idx][k] > 0) {
                        maxHeight = k+1;
                    }
                }
                this.patchHeightMap[idx] = maxHeight;
            }
        }

        let potentialtreeLocations: number[] = [];
        let locationOkay: boolean = true;
        for (let i = 5; i < this.size-5; i++) {
            for (let j = 5; j < this.size-5; j++) {
                locationOkay = true;
                const idx1 = this.size * i + j;
                const height1 = this.patchHeightMap[idx1];
                for (let k = -5; k <= 5; k++) {
                    for (let l = -5; l <= 5; l++) {
                        const idx2 = this.size * k + l;
                        const height2 = this.patchHeightMap[idx2];
                        if (height1 < height2) {
                            locationOkay = false;
                            break;
                        }
                    }
                }
                if (locationOkay) {
                    potentialtreeLocations.push(idx1);
                    j += 10;
                }
            }
            if (locationOkay) {
                // potentialtreeLocations.push(idx1);
                i += 10;
            }
        }

        let treeLocations: number[] = [];
        let trees: TreeBranch[][] = [];
        let systemsChosen: number[] = []
        let treeCubes = 0;

        for (let i=0; i<3; i++) {
            let loc = randomInt(0, potentialtreeLocations.length-1);
            treeLocations.push(potentialtreeLocations[loc]);
            let p = Math.random();
            let tree: TreeBranch[];
            if (p < 0.25) {
                this.lSystem1.processForDepth(null);
                tree = this.lSystem1.getBranches();
                systemsChosen.push(1);
            }
            else {
                this.lSystem2.processForDepth(null);
                tree = this.lSystem2.getBranches();
                systemsChosen.push(2);
            }
            trees.push(tree);
            treeCubes += tree.length;
        }

        // let highestCubeLocation = [0,0];
        let maxHeight = 0;
        let numberOfCubes = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const idx = this.size * i + j;
                const height = this.patchHeightMap[idx]; 
                // if (height > maxHeight)
                // {
                //     highestCubeLocation = [i,j];
                //     maxHeight = height;
                // }
                numberOfCubes += this.numberOfCubesToDraw(this.patchHeightMap, i, j, height);
            }
        }

        // let systemChosen: number;
        // let p = Math.random();
        // let tree: TreeBranch[];
        // if (p < 0.5) {
        //     this.lSystem1.processForDepth(null);
        //     tree = this.lSystem1.getBranches();
        //     systemChosen = 1;
        // }
        // else {
        //     this.lSystem2.processForDepth(null);
        //     tree = this.lSystem2.getBranches();
        //     systemChosen = 2;
        // }

        // Pass the cubes to be drawn
        this.origCubes = numberOfCubes;
        numberOfCubes += treeCubes

        this.cubes = numberOfCubes;
        this.cubePositionsF32 = new Float32Array(4 * numberOfCubes);
        this.cubeTypesF32 = new Float32Array(numberOfCubes);
        let position = 0;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const height = Math.floor(this.patchHeightMap[this.size * i + j]);
                const idx = this.size * i + j;
                for (let k = 0; k < height; k++) {
                    if (this.drawAtK(i, j, k, height)) {
                        const baseIndex = 4 * position;
                        this.cubePositionsF32[baseIndex] = topleftx + i;
                        this.cubePositionsF32[baseIndex + 1] = k; 
                        this.cubePositionsF32[baseIndex + 2] = toplefty + j;
                        this.cubePositionsF32[baseIndex + 3] = 0;
                        // logic to draw golden cube, 3.0 for golden
                        if (position % 64 == 0 && position < this.origCubes && position >= 1000) {
                            this.cubeTypesF32[position] = 3.0
                        } else {
                            this.cubeTypesF32[position] = 0.0;
                        }
                        
                        position++;
                    }
                }
            }
        }

        for (let i =0; i< trees.length; i++) {
            let tree = trees[i];
            for (const branch of tree) {

                const idx = treeLocations[i];
                // this.size * i + j;
                const treeJ = treeLocations[i] % this.size;
                const treeI = Math.floor((treeLocations[i]-treeJ)/this.size);
                const baseIndex = 4 * position;
                this.cubePositionsF32[baseIndex] = topleftx + treeI + branch.getStart().x;
                this.cubePositionsF32[baseIndex + 1] = this.patchHeightMap[idx] + branch.getStart().y;
                this.cubePositionsF32[baseIndex + 2] = toplefty + treeJ + branch.getStart().z;
                this.cubePositionsF32[baseIndex + 3] = 0;

                console.log(treeI, treeJ, treeLocations[i]);

                if (systemsChosen[i] == 2) {
                    if (branch.getStart().y < 3.0) {
                        this.cubeTypesF32[position] = 1.0; // brown
                    }
                    else if (branch.getStart().y < 4.0) {
                        // mix of brown and green
                        let rand = Math.random();
                        if (rand < 0.5) {
                            this.cubeTypesF32[position] = 1.0;
                        }
                        else {
                            this.cubeTypesF32[position] = 2.0;
                        }
                    }
                    else {
                        this.cubeTypesF32[position] = 2.0; // green
                    }
                }         

                else {
                    if (branch.isLeaf() || position >= this.origCubes + 100) {
                        this.cubeTypesF32[position] = 2.0;
                    }
                    else {
                        this.cubeTypesF32[position] = 1.0;
                    }
                }
                
                position++;
            }
        }
    }

    private smoothmix(a0: number, a1: number, w: number) {
        return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
    }

    // Standard function for generating points uniformly on a unit sphere
    private unit_vec_3d(xyz: Vec3, seed: number): Vec3 {
        let theta: number = 2 * Math.PI * this.random(xyz, seed); // 2* PI * random value
        let phi: number = Math.acos(2.0 * this.random(Vec3.sum(xyz, new Vec3([1.0, 2.0, 3.0])), seed + 1.0) - 1.0); // acos(2*random - 1)
    
        let x: number = Math.sin(phi) * Math.cos(theta);
        let y: number = Math.sin(phi) * Math.sin(theta);
        let z: number = Math.cos(phi);
    
        return new Vec3([x, y, z]);
    }
    
    // We use the OpenGL way to generate random numbers here to keep in sync with perlin 2d, it also seems faster than TS Rand()
    private random(xyz: Vec3, seed: number): number {
        let temp = (Math.sin(Vec3.dot(Vec3.sum(xyz, new Vec3([seed, seed, seed])), new Vec3([12.9898, 78.233, 54.53]))) * 43758.5453);
        return Math.abs(temp) - Math.floor(Math.abs(temp));
    }

    // Similar to perlin() in shader, but essentially in 3d, mainly need to change unit_vec_3d to account for
    // points on a unit sphere instead of a unit circle
    private perlin3DNoise(i: number, j: number, k: number, topLeftx: number, topLefty: number) {
        let grid_spacing: number = 2.0;
        let uvFrac = new Vec3([(topLeftx+i)/grid_spacing, (topLefty+j)/grid_spacing, k/grid_spacing]);
        let grid = new Vec3([Math.floor(uvFrac.x), Math.floor(uvFrac.y), Math.floor(uvFrac.z)]);
        
        let randVecs: Vec3[] = new Array(8);
        for (let i=0; i<vecsAdd.length; i++) {
            randVecs[i] = this.unit_vec_3d(Vec3.sum(grid, vecsAdd[i]), seed);
        }

        let dotProds: number[] = new Array(vecsAdd.length);
        for (let i=0; i<vecsAdd.length; i++) {
            dotProds[i] = Vec3.dot(Vec3.difference(Vec3.difference(uvFrac, grid), vecsAdd[i]), randVecs[i]);
        }

        let varX = uvFrac.x - grid.x;
        let varY = uvFrac.y - grid.y;
        let varZ = uvFrac.z - grid.z;
        

        // Trilinear interpolation using smoothmix instead of mix
        let smooth1x = this.smoothmix(dotProds[0], dotProds[4], varX);
        let smooth2x = this.smoothmix(dotProds[1], dotProds[5], varX);
        let smooth3x = this.smoothmix(dotProds[2], dotProds[6], varX);
        let smooth4x = this.smoothmix(dotProds[3], dotProds[7], varX);

        let smooth1y = this.smoothmix(smooth1x, smooth3x, varY);
        let smooth2y = this.smoothmix(smooth2x, smooth4x, varY);

        let smoothz = this.smoothmix(smooth1y, smooth2y, varZ);

        return smoothz + 0.5; 

    }
    
    // Check if the player new position goes inside any cube
    public lateralCheck(newPosition: Vec3, radius: number, maxHeightToCheck: number): boolean {
        const topLeftX = this.x - this.size / 2;
        const topLeftZ = this.y - this.size / 2;
        const playerTopY = Math.round(newPosition.y);
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                const testPointX = (offsetX == 0) ? newPosition.x : Math.round(newPosition.x) - 0.5 + offsetX;
                const testPointZ = (offsetZ == 0) ? newPosition.z : Math.round(newPosition.z) - 0.5 + offsetZ;
                let testingPoint = new Vec2([testPointX, testPointZ]);
                let newOffsetX = (offsetX == -1) ? 1 : 0;
                let newOffsetZ = (offsetZ == -1) ? 1 : 0;
                testingPoint.add(new Vec2([newOffsetX, newOffsetZ]));
                const dist = Vec2.distance(testingPoint, new Vec2([newPosition.x, newPosition.z]));
                if (dist < radius) {
                    const gridX = Math.round(newPosition.x - topLeftX) + offsetX;
                    const gridZ = Math.round(newPosition.z - topLeftZ) + offsetZ;
                    if (gridX >= 0 && gridZ >= 0 && gridX < this.size && gridZ < this.size) {
                        const idx = gridX * this.size + gridZ;
                        const height = this.opacities[idx].length;
                        for (let k = 0; k <= 2.0; k ++){
                            if (playerTopY - k < height && this.opacities[idx][playerTopY-k] >= 0) {
                                return true;
                            }
                        }
                        
                    }
                }
            }
        }
        return false;
    }

    // augment the Chunk class with logic for determining the minimum vertical position
    public minimumVerticalPosition(newPosition: Vec3, maxHeightToCheck: number, isAscending: boolean): number{
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
        const baseY = Math.round(newPosition.y - maxHeightToCheck);
        const topY = Math.round(newPosition.y);
        const height = this.opacities[idx].length;
        if (isAscending) {
            for (let i = 0; i <= 2.0; i++) {
                if (baseY + i + 1 < height) {
                    return baseY + i - 2.5;
                }
            }
        } else {
            for (let i = 0; i <= 2.0; i++) {
                if (topY - i < height) {
                    return topY - i + 0.5;
                }
            }
        }
        return Number.MIN_SAFE_INTEGER;
    }

    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }

    public cubeTypes(): Float32Array {
        return this.cubeTypesF32;
    }

    public numCubes(): number {
        return this.cubes;
    }

    public selectedCubesUpdate(showCubes: boolean, blockToRemove: Vec3): boolean {
        // Calculate bounds of the chunk
        const topleftX = this.x - this.size / 2;
        const topleftY = this.y - this.size / 2;
        const bottomRightX = this.x + this.size / 2;
        const bottomRightY = this.y + this.size / 2;
        if (this.cubePositionToHighlight < this.cubes) {
            this.cubePositionsF32[4 * this.cubePositionToHighlight + 3] = 0; // Reset the highlight value
        }
        if (!showCubes) {
            return false;
        }
        if (topleftX > blockToRemove.x || blockToRemove.x >= bottomRightX ||
            topleftY > blockToRemove.z || blockToRemove.z >= bottomRightY) {
            return false;
        }
        for (let i = 0; i < this.cubes; ++i) {
            if (this.cubePositionsF32[4 * i] === blockToRemove.x &&
                this.cubePositionsF32[4 * i + 1] === blockToRemove.y &&
                this.cubePositionsF32[4 * i + 2] === blockToRemove.z) {
                this.cubePositionsF32[4 * i + 3] = 3; // Set the highlight value
                this.cubePositionToHighlight = i;
                return true; // Indicate successful highlight
            }
        }

        return false; // No cube was highlighted
    }

    public updateField(deleteTheCube: boolean, selectedCube: Vec3): boolean {
        // Calculate bounds of the chunk
        const topLeftX = this.x - this.size / 2;
        const topLeftY = this.y - this.size / 2;
        const bottomRightX = this.x + this.size / 2;
        const bottomRightY = this.y + this.size / 2;
        
        // Check if the selected cube is within the chunk bounds
        if (topLeftX > selectedCube.x ||
            selectedCube.x >= bottomRightX ||
            topLeftY > selectedCube.z ||
            selectedCube.z >= bottomRightY) {
            return false;
        }

        let removedCubeType: number = 0.0;
        // save the cube type
        for (let i = 0; i < this.cubes; ++i) {
            if (this.cubePositionsF32[4 * i] === selectedCube.x &&
                this.cubePositionsF32[4 * i + 1] === selectedCube.y &&
                this.cubePositionsF32[4 * i + 2] === selectedCube.z) {
                    removedCubeType = this.cubeTypesF32[i];
            }
        }
        // Update the number of cubes based on whether we are adding or removing a cube
        let updatedCubes = this.cubes + (deleteTheCube ? -1 : 1);

        // Create a new array to store updated cube positions
        let updatedPositionsF32 = new Float32Array(4 * updatedCubes);
        let updatedCubeTypes = new Float32Array(updatedCubes);
        let index = 0;  // Index for new positions array
        console.log("this.goldenCubesCount 1", this.goldenCubesCount);
        for (let i = 0; i < this.cubes; ++i) {
            // Skip the cube to be removed
            if (deleteTheCube && this.cubePositionsF32[4 * i] === selectedCube.x &&
                this.cubePositionsF32[4 * i + 1] === selectedCube.y &&
                this.cubePositionsF32[4 * i + 2] === selectedCube.z) {
                    console.log("this.cubeTypesF32[index]", this.cubeTypesF32[index]);
                    
                    if (this.cubeTypesF32[index] == 3.0) {
                        this.goldenCubesCount += 1;
                    }
                continue;
            }
            
            // Copy current cube to new position array
            updatedPositionsF32.set(this.cubePositionsF32.subarray(4 * i, 4 * i + 4), 4 * index);
            // copy current cube to the new cube type array
            updatedCubeTypes[index] = this.cubeTypesF32[index];
            index++;
        }
        console.log("this.goldenCubesCount2", this.goldenCubesCount);

        // Add the new cube if not removing
        if (!deleteTheCube) {
            updatedPositionsF32.set([selectedCube.x, selectedCube.y, selectedCube.z, 3], 4 * index);
            this.cubePositionToHighlight = index;  // Update highlighted position index
            console.log("removedCubeType", removedCubeType);
            updatedCubeTypes[index] = 0.0;
            // TODO: make hashmap if yoy have time to re-render the golden v
            // if (index % 64 == 0 && index < this.origCubes && index >= 1000) {
            //     updatedCubeTypes[index] = 3.0
            // } else {
            //     updatedCubeTypes[index] = 0.0;
            // }
        }
        this.cubePositionsF32 = updatedPositionsF32;
        this.cubeTypesF32 = updatedCubeTypes;
        this.cubes = updatedCubes;
        return true;
    }
}
