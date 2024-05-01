import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {

  blankCubeFSText,
  blankCubeVSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
import { Lsystems } from "./LSystemsFractals.js";

const sizeOfTerrain = 64.0;
const radius = 0.4;
const maxHeightToCheck = 2.0;
const gravity = -9.8;

const LSys1StartString = "FFFA";
const LSys1Rules = new Map<string, string>();
LSys1Rules.set("A","/F[&&FFA]L///[&&FFA]///[&FFA]/////[&FFLA]");
LSys1Rules.set("F","\\^S//F");
LSys1Rules.set("S", "FL");
LSys1Rules.set("L", "[^^-/+f|-f+f+f]");
LSys1Rules.set("M", "[//^^&ff-ff-]");
const LSys1TurnAngle = 18;
const LSys1SegmentLength = 0.2; // TODO: Should we change this to 0.2?

export class night_light {
  public static change_velocity : number = 240;
}

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;
  
  chunk : Chunk;
  // For rendering
  stackOfChunks : Map<string, Chunk>;
  // For caching
  cacheHash : Map<string, Chunk>;
  // hysteresis logic to chunk creation and destruction to fix this issue.
  // the chosen number is 9 since the chunks are 1 + 8
  cacheLimit: number;
  
  // extras
  private timeForGravity: number;
  private timeForFrames: number;
  // check if we are showing the cubes that can be removed, from Gui.ts
  public showCubes: boolean;
  private deleteTheCube: boolean;
  private cacheRemoved: number[][];
  
  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  
  // Player's head position in world coordinate.
  // Player should extend two units down from this location, and 0.4 units radially.
  private playerPosition: Vec3;
  private isPlayerOnGround: boolean;
  private speed: Vec3;

  private lSystem: Lsystems;
  
  // target cube
  private selectedTargetCube: boolean;
  // array for the target cubes
  private selectedTargetCubeF32: Float32Array;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    // init the delete cube elements
    this.selectedTargetCube = false;
    this.showCubes = false;
    this.cacheRemoved = [];

    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = this.gui.getCamera().pos();

    this.lSystem = new Lsystems(LSys1StartString, LSys1Rules, LSys1SegmentLength, LSys1TurnAngle);
    this.lSystem.processForDepth(5);
    
    // Generate initial landscape
    this.chunk = new Chunk(0.0, 0.0, 64, this.playerPosition, this.lSystem);
    this.stackOfChunks = new Map();
    this.cacheHash  = new Map();
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
  public reset(): void {    
      this.gui.reset();
      
      this.playerPosition = this.gui.getCamera().pos();
      
  }
  
  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aNorm",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.normalsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.uvFlat()
    );
    
    this.blankCubeRenderPass.addInstancedAttribute("aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    this.blankCubeRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    this.blankCubeRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    this.blankCubeRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });
    this.blankCubeRenderPass.addUniform("perlinTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, (Date.now() / 400) % (2 * Math.PI));
    });
    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();    
  }

  private generateChunks(): void {
    const chunkSize = 64.0;
    const offset = 32.0;
    let centerX = Math.floor((this.playerPosition.x + offset) / chunkSize) * chunkSize;
    let centerZ = Math.floor((this.playerPosition.z + offset) / chunkSize) * chunkSize;
    let createNewChunks = new Map<string, Chunk>();
    // going in all directions
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            let xCoord = centerX + chunkSize * i;
            let zCoord = centerZ + chunkSize * j;
            const key = `${Math.round(xCoord)} ${Math.round(zCoord)}`;
            let currentChunk = this.stackOfChunks.get(key);
            let cacheChunk = this.cacheHash.get(key);
            if (currentChunk) {
              createNewChunks.set(key, currentChunk);
            // if is in already in cache
            } else if (cacheChunk) {
              createNewChunks.set(key, cacheChunk);
            } else {
              const newChunk = new Chunk(xCoord, zCoord, chunkSize, this.playerPosition, this.lSystem);
              createNewChunks.set(key, newChunk);
            }
            // if the block is in the position 4 it means it is the center of the character
            // therefore we assign accordingly
            if (i == 0 && j == 0) {
              this.chunk = createNewChunks.get(key)!;
            }
        }
    }
    this.cleanupCaches(createNewChunks);
    this.stackOfChunks = createNewChunks;
  }

  private cleanupCaches(newChunks: Map<string, Chunk>): void {
    const keysToRemove: string[] = [];
    this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
        if (!newChunks.has(key)) {
            if (this.cacheHash.size > this.cacheLimit) {
                keysToRemove.push(key);
            } else {
                this.cacheHash.set(key, chunk);
            }
        }
    });

    // Perform removal outside the forEach to avoid concurrent modification issues
    keysToRemove.forEach(key => this.cacheHash.delete(key));
  }

  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    
    // Generating the chunks according to the position
    this.generateChunks();
    
    // Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. 
    // Handle gravity, jumping, and loading of new chunks when necessary.
    let newPosition : Vec3 = new Vec3(this.playerPosition.xyz);
    // add new position considering walkDir
    let possibles: Chunk[] = []; // Start with the current chunk
    possibles.push(this.chunk);
    const values: Vec4 = this.chunk.getValues();
    const center = new Vec3([values.x, 0, values.y]);
    const xDiff = Math.abs(Math.abs(this.playerPosition.x) % sizeOfTerrain - sizeOfTerrain / 2);
    const zDiff = Math.abs(Math.abs(this.playerPosition.z) % sizeOfTerrain - sizeOfTerrain / 2);
    const nearXBoundary = xDiff <= 2.0;
    const nearZBoundary = zDiff <= 2.0;
    if (nearXBoundary && nearZBoundary) {
      const keyNearXandZBoundaries1 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z + sizeOfTerrain)}`;
      const keyNearXandZBoundaries2 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z + sizeOfTerrain)}`;
      const keyNearXandZBoundaries3 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z - sizeOfTerrain)}`;
      const keyNearXandZBoundaries4 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z - sizeOfTerrain)}`;
      possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries1)!);
      possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries2)!);
      possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries3)!);
      possibles.push(this.stackOfChunks.get(keyNearXandZBoundaries4)!);
    }
    if (nearXBoundary) {
      const keyNearXBoundary1 = `${Math.round(center.x + sizeOfTerrain)} ${Math.round(center.z)}`;
      const keyNearXBoundary2 = `${Math.round(center.x - sizeOfTerrain)} ${Math.round(center.z)}`;
      possibles.push(this.stackOfChunks.get(keyNearXBoundary1)!);
      possibles.push(this.stackOfChunks.get(keyNearXBoundary2)!);
    }
    if (nearZBoundary) {
      const keyNearZBoundary1 = `${Math.round(center.x)} ${Math.round(center.z + sizeOfTerrain)}`;
      const keyNearZBoundary2 = `${Math.round(center.x)} ${Math.round(center.z - sizeOfTerrain)}`;
      possibles.push(this.stackOfChunks.get(keyNearZBoundary1)!);
      possibles.push(this.stackOfChunks.get(keyNearZBoundary2)!);
    }
    // predict new position in world
    newPosition.add(this.gui.walkDir());
    // check if the position is free of collisions
    let exit : boolean = true;
    for (let chunk of possibles) {
      if (chunk.lateralCheck(newPosition.copy(), radius, maxHeightToCheck)) {
        exit = false;
        this.playerPosition.x = Math.round(this.playerPosition.x);
        this.playerPosition.z = Math.round(this.playerPosition.z);
        break;
      }
    }
    // if free of collisions, we move the player
    if (exit) {
      this.playerPosition = newPosition.copy();
    }

    newPosition = new Vec3(this.playerPosition.xyz);
    let velocity: Vec3 = this.calculateCurrentVelocity();
    newPosition.add(velocity);
    this.timeForFrames = Date.now();
    let checkIfPossible = true;
    for (let chunk of possibles) {
      checkIfPossible = this.checkVerticalCollisions(newPosition, chunk, velocity);
      if (!checkIfPossible) {
        break;
      }
    }
    if (checkIfPossible) {
      this.isPlayerOnGround = true;
      this.playerPosition = newPosition;
    }
    
    this.gui.getCamera().setPos(this.playerPosition);
    this.updateLightAndBackground();
    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, 1280, 960);        
  }
  
  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    // Render multiple chunks around the player, using Perlin noise shaders
    // the starter code passes an array of 4096 per-cube translation vectors in the 
    // aOffset instanced vertex attribute buffer 
    // Iterate over each chunk in the stack
    this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
      this.blankCubeRenderPass.updateAttributeBuffer('aOffset', chunk.cubePositions());
      this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
    });
    
    // In case we have cubes to highlight and the highlight is on by the user
    // we show one instance of it
    if (this.selectedTargetCube && this.showCubes) {
      this.blankCubeRenderPass.updateAttributeBuffer(
        'aOffset', this.selectedTargetCubeF32);
      this.blankCubeRenderPass.drawInstanced(1);
    }
  }

  private calculateCurrentVelocity(): Vec3 {
    let timeElapsed = (Date.now() - this.timeForFrames) / 1000.0;
    let gravityEffect = gravity * (Date.now() - this.timeForGravity) / 1000.0;
    let velocity: Vec3 = new Vec3([0.0, gravityEffect, 0.0]);

    velocity.add(this.speed);
    velocity.scale(timeElapsed);
    return velocity;
  }

  private checkVerticalCollisions(position: Vec3, chunk: Chunk, velocity: Vec3): boolean {
    let isAscending = (velocity.y > 0) ? true : false;
    let height = chunk.minimumVerticalPosition(position, maxHeightToCheck, isAscending);
    if (height != Number.MIN_SAFE_INTEGER) {
      this.playerPosition.y = height + maxHeightToCheck;
      this.isPlayerOnGround = true;
      this.speed = new Vec3();
      this.timeForGravity = Date.now();
      return false; // Collision detected, not safe to move
    }
    return true; // No collision, safe to move
  }

  public getGUI(): GUI {
    return this.gui;
  }  
  
  
  public jump() {
      // If the player is not already in the air, launch them upwards at 10 units/sec.
      if (this.isPlayerOnGround) {
        this.speed = new Vec3([0.0, 10.0, 0.0]);
      }
  }

  public interpolate(color1: Vec4, color2: Vec4, factor: number): Vec4 {
    return new Vec4([
        color1.x + (color2.x - color1.x) * factor,
        color1.y + (color2.y - color1.y) * factor,
        color1.z + (color2.z - color1.z) * factor,
        color1.w
    ]);
  }

  public updateLightAndBackground(): void {
    // x and z coordinates of the player center
    const centerWorld = new Vec4([this.playerPosition.x, 0.0, this.playerPosition.z, 0.0]);
    // 
    const cycleTime = (Date.now() / (night_light.change_velocity * 1000 / 60)) % (2 * Math.PI);
    const sin = Math.sin(cycleTime);
    const cos = Math.cos(cycleTime);
    const amplitude = 1000.0; // Define amplitude for the elliptical path

    const curveVector = new Vec4([
        amplitude * sin,   // X coordinate
        amplitude * cos,   // Y coordinate (altitude changes simulate day/night)
        amplitude * sin,   // Z coordinate
        1.0                 // Homogeneous coordinate for transformations
    ]);

    this.lightPosition = Vec4.sum(centerWorld, curveVector);
    
    const normalizedAltitude = (this.lightPosition.y + amplitude) / (2 * amplitude); // Normalize Y to [0, 1]
    const clampedHeightPercent = Math.max(Math.min(normalizedAltitude, 1.0), 0.0); // Clamp between [0, 1]
    let nightColor = new Vec4([19.0 / 256.0, 24.0 / 256.0, 98.0 / 256.0, 1.0 ]);
    let dayColor = new Vec4([130.0 / 256.0, 202.0 / 256.0, 255.0 / 256.0, 1.0 ]);
    this.backgroundColor = this.interpolate(nightColor, dayColor, clampedHeightPercent);
    this.backgroundColor.w = 1.0; // Ensure fully opaque color
  }
  // TODO:FIXFIXFIXFIXFIXFIXFIXFIXFIXFIX
  public updateCubeToRemove(blockToRemove: Vec3): void {
    this.selectedTargetCubeF32 = new Float32Array(4);
    this.selectedTargetCubeF32.set([blockToRemove.x, blockToRemove.y, blockToRemove.z, 2.0]);

    let isRemovingCube: boolean = false;
    this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
      isRemovingCube = isRemovingCube || chunk.selectedCubesUpdate(this.showCubes, blockToRemove);
    });
    this.deleteTheCube = isRemovingCube;
    this.selectedTargetCube = true;
  }

  public updateFieldWithRemovedCube(selectedCube: Vec3): void {
      const { x, y, z } = selectedCube;
      let newCache: number[][] = [];
      let cubeInCache: boolean = false;
    
      for (let logEntry of this.cacheRemoved) {
          if (logEntry[0] === x && logEntry[1] === y && logEntry[2] === z) {
            cubeInCache = true;
          } else {
            newCache.push(logEntry);
          }
      }
      if (!cubeInCache) {
        newCache.push([x, y, z]);
      }
      this.cacheRemoved = newCache;
      this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
        chunk.updateField(this.deleteTheCube, selectedCube);
      });
      this.deleteTheCube = !this.deleteTheCube;
  }

}

export function initializeCanvas(): void {
  // let rules = new Map<string, string>();
  // rules.set("F", "F+F-F-FF+F+F-F");
  // let lsys = new Lsystems("F", rules, 1, 90);
  // lsys.processForDepth(2);
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
