import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import { blankCubeFSText, blankCubeVSText } from "./Shaders.js";
import { Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
const sizeOfTerrain = 64.0;
const radius = 0.4;
// TODO: confirm if better
const maxHeightToCheck = 2.0;
const gravity = -9.8;
const jumpingSpeed = 9.8;
export class MinecraftAnimation extends CanvasAnimation {
    constructor(canvas) {
        super(canvas);
        this.canvas2d = document.getElementById("textCanvas");
        this.ctx = Debugger.makeDebugContext(this.ctx);
        let gl = this.ctx;
        this.gui = new GUI(this.canvas2d, this);
        this.playerPosition = this.gui.getCamera().pos();
        // Generate initial landscape
        this.chunk = new Chunk(0.0, 0.0, 64);
        this.stackOfChunks = new Map();
        this.cacheHash = new Map();
        this.cacheLimit = 9;
        // this.isPlayerOnGround = false;
        this.speed = new Vec3();
        this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText);
        this.cubeGeometry = new Cube();
        this.initBlankCube();
        this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
        this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);
        this.timeForFrames = Date.now();
        this.timeForGravity = Date.now();
    }
    /**
     * Setup the simulation. This can be called again to reset the program.
     */
    reset() {
        this.gui.reset();
        this.playerPosition = this.gui.getCamera().pos();
    }
    /**
     * Sets up the blank cube drawing
     */
    initBlankCube() {
        this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
        this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
        this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.blankCubeRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.blankCubeRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.blankCubeRenderPass.addUniform("uView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
        this.blankCubeRenderPass.setup();
    }
    getChunk(key, stack) {
        return stack.get(key);
    }
    // TODO: confirm if it's correct
    generateChunks() {
        const chunkSize = 64.0;
        const offset = 32.0;
        let centerX = Math.floor((this.playerPosition.x + offset) / chunkSize) * chunkSize;
        let centerZ = Math.floor((this.playerPosition.z + offset) / chunkSize) * chunkSize;
        let createNewChunks = new Map();
        // going in all directions
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                let xCoord = centerX + chunkSize * i;
                let zCoord = centerZ + chunkSize * j;
                // TODO: confirm cache working
                const key = `${Math.round(xCoord)} ${Math.round(zCoord)}`;
                let currentChunk = this.stackOfChunks.get(key);
                let cacheChunk = this.cacheHash.get(key);
                if (currentChunk) {
                    createNewChunks.set(key, currentChunk);
                    // if is in already in cache
                }
                else if (cacheChunk) {
                    createNewChunks.set(key, cacheChunk);
                }
                else {
                    const newChunk = new Chunk(xCoord, zCoord, chunkSize);
                    createNewChunks.set(key, newChunk);
                }
                // TODO: confirm exclamation
                // if the block is in the position 4 it means it is the center of the character
                // therefore we assign accordingly
                if (i == Math.floor(this.cacheLimit / 2)) {
                    this.chunk = this.getChunk(key, createNewChunks);
                }
            }
        }
        // TODO: fix these two cacas
        // Clear cache if it exceeds the configured maximum size for hysteresis logic
        if (Object.keys(this.cacheHash).length > this.cacheLimit) {
            this.cacheHash.clear();
        }
        // Cache those chunks that exist in current but not in new chunks
        // TODO: this can exceed the limit of cache (9 elements) after we assign more elements
        // better the logic by popping one element if we find a new element, FIFO or LRU or whatever
        this.stackOfChunks.forEach((chunk, key) => {
            if (!(createNewChunks.get(key))) {
                this.cacheHash.set(key, this.stackOfChunks.get(key));
            }
        });
        this.stackOfChunks = createNewChunks;
    }
    /**
     * Draws a single frame
     *
     */
    draw() {
        // Generating the chunks according to the position
        this.generateChunks();
        //TODO: Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. 
        // Handle gravity, jumping, and loading of new chunks when necessary.
        // this.playerPosition.add(this.gui.walkDir());
        let newPosition = new Vec3(this.playerPosition.xyz);
        // add new position considering walkDir
        let possibles = this.getPossibleBlocks(this.playerPosition);
        newPosition.add(this.gui.walkDir());
        // if the player has moved
        if (!newPosition.equals(this.playerPosition)) {
            if (this.isNewPositionSafe(newPosition, possibles)) {
                this.playerPosition = newPosition;
            }
            else {
                // the new position is not valid
                this.playerPosition.x = Math.round(this.playerPosition.x);
                this.playerPosition.z = Math.round(this.playerPosition.z);
            }
        }
        newPosition = new Vec3(this.playerPosition.xyz);
        let velocity = this.calculateCurrentVelocity();
        newPosition.add(velocity);
        this.timeForFrames = Date.now();
        // let possiblesVertical: Chunk[] = this.getPossibleBlocks(this.playerPosition);
        let checkIfPossible = true;
        for (let chunk of possibles) {
            checkIfPossible = this.checkVerticalCollisions(newPosition, chunk);
            if (!checkIfPossible) {
                break;
            }
        }
        if (checkIfPossible) {
            this.isPlayerOnGround = true;
            this.playerPosition = newPosition;
        }
        this.gui.getCamera().setPos(this.playerPosition);
        // this.timeForFrames = Date.now(); // Update the last frame time
        // Drawing
        const gl = this.ctx;
        const bg = this.backgroundColor;
        gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.frontFace(gl.CCW);
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
        this.drawScene(0, 0, 1280, 960);
    }
    drawScene(x, y, width, height) {
        const gl = this.ctx;
        gl.viewport(x, y, width, height);
        // Render multiple chunks around the player, using Perlin noise shaders
        // the starter code passes an array of 4096 per-cube translation vectors in the 
        // aOffset instanced vertex attribute buffer
        // this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.chunk.cubePositions());
        // this.blankCubeRenderPass.drawInstanced(this.chunk.numCubes());    
        // Iterate over each chunk in the stack
        // console.log("drawScene 1\n");
        // for (const chunk of this.stackOfChunks.getChunks()) {
        this.stackOfChunks.forEach((chunk, key) => {
            this.blankCubeRenderPass.updateAttributeBuffer('aOffset', chunk.cubePositions());
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        });
    }
    getPossibleBlocks(newPosition) {
        // check for possible collisions detections
        const possibles = [this.chunk]; // Start with the current chunk
        const values = this.chunk.getValues();
        const center = new Vec3([values.x, 0, values.y]);
        // TODO: confirm math
        const xDiff = Math.abs(this.playerPosition.x - center.x) % sizeOfTerrain;
        const zDiff = Math.abs(this.playerPosition.z - center.z) % sizeOfTerrain;
        const nearXBoundary = xDiff <= 2.0 || xDiff >= sizeOfTerrain - 2.0;
        const nearZBoundary = zDiff <= 2.0 || zDiff >= sizeOfTerrain - 2.0;
        if (nearXBoundary) {
            const keyNearXBoundary1 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z)}`;
            const keyNearXBoundary2 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z)}`;
            possibles.push(this.stackOfChunks.get(keyNearXBoundary1));
            possibles.push(this.stackOfChunks.get(keyNearXBoundary2));
        }
        if (nearZBoundary) {
            const keyNearZBoundary1 = `${Math.round(center.x)} ${Math.round(center.z + sizeOfTerrain)}`;
            const keyNearZBoundary2 = `${Math.round(center.x)} ${Math.round(center.z - sizeOfTerrain)}`;
            possibles.push(this.stackOfChunks.get(keyNearZBoundary1));
            possibles.push(this.stackOfChunks.get(keyNearZBoundary2));
        }
        if (nearXBoundary && nearZBoundary) {
            const keyNearXandZBoundaries1 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z + sizeOfTerrain)}`;
            const keyNearXandZBoundaries2 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z + sizeOfTerrain)}`;
            const keyNearXandZBoundaries3 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z - sizeOfTerrain)}`;
            const keyNearXandZBoundaries4 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z - sizeOfTerrain)}`;
            possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries1));
            possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries2));
            possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries3));
            possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries4));
        }
        return possibles;
    }
    isNewPositionSafe(position, chunks) {
        for (let i = 0; i < chunks.length; i++) {
            // for (let chunk of chunks) {
            if (chunks[i].lateralCheck(position, radius, maxHeightToCheck)) {
                return false;
            }
        }
        return true;
    }
    calculateCurrentVelocity() {
        let timeElapsed = (Date.now() - this.timeForFrames) / 1000.0;
        let gravityEffect = gravity * (Date.now() - this.timeForGravity) / 1000.0;
        let velocity = new Vec3([0.0, gravityEffect, 0.0]);
        velocity.add(this.speed);
        velocity.scale(timeElapsed);
        return velocity;
    }
    checkVerticalCollisions(position, chunk) {
        let height = chunk.minimumVerticalPosition(position, maxHeightToCheck);
        if (height != Number.MIN_SAFE_INTEGER) {
            this.playerPosition.y = height + maxHeightToCheck;
            this.isPlayerOnGround = true;
            this.speed = new Vec3();
            this.timeForGravity = Date.now();
            return false; // Collision detected, not safe to move
        }
        return true; // No collision, safe to move
    }
    getGUI() {
        return this.gui;
    }
    jump() {
        //TODO: If the player is not already in the lair, launch them upwards at 10 units/sec.
        if (this.isPlayerOnGround) {
            this.speed = new Vec3([0.0, jumpingSpeed, 0.0]);
        }
    }
}
export function initializeCanvas() {
    const canvas = document.getElementById("glCanvas");
    /* Start drawing */
    const canvasAnimation = new MinecraftAnimation(canvas);
    canvasAnimation.start();
}
//# sourceMappingURL=App.js.map