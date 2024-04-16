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

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;
  
  chunk : Chunk;
  // For rendering
  stackOfChunks : Map<string, Chunk>;
  //  Record<string, Chunk> = {};
  // For caching
  cacheHash : Map<string, Chunk>;
  // hysteresis logic to chunk creation and destruction to fix this issue.
  // the chosen number is 9 since the chunks are 1 + 8
  // TODO: maybe put this in other part of the project as configuration item
  cacheLimit: number;
  
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
  
  
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
  
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = this.gui.getCamera().pos();
    
    // Generate initial landscape
    this.chunk = new Chunk(0.0, 0.0, 64);
    this.stackOfChunks = new Map();
    this.cacheHash  = new Map();
    this.cacheLimit = 9;
    
    this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText);
    this.cubeGeometry = new Cube();
    this.initBlankCube();
    
    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);    
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
    
    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();    
  }

  public getChunk(key: string, stack: Map<string, Chunk>): Chunk | undefined {
    return stack.get(key);
  }

  // TODO: confirm if it's correct
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
            // TODO: confirm cache working
            const key = `${Math.round(xCoord)} ${Math.round(zCoord)}`;
            let currentChunk = this.stackOfChunks.get(key);
            let cacheChunk = this.cacheHash.get(key);
            if (currentChunk) {
              createNewChunks.set(key, currentChunk);
            // if is in already in cache
            } else if (cacheChunk) {
              createNewChunks.set(key, cacheChunk);
            } else {
              const newChunk = new Chunk(xCoord, zCoord, chunkSize);
              createNewChunks.set(key, newChunk);
            }
            // TODO: confirm exclamation
            // if the block is in the position 4 it means it is the center of the character
            // therefore we assign accordingly
            if (i == Math.floor(this.cacheLimit / 2)) {
              this.chunk = this.getChunk(key, createNewChunks)!;
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
    this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
      if (!(createNewChunks.get(key))) {
          this.cacheHash.set(key, this.stackOfChunks.get(key)!);
      }
    });
    this.stackOfChunks = createNewChunks;
  }

  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    //TODO: Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. Handle gravity, jumping, and loading of new chunks when necessary.
    this.playerPosition.add(this.gui.walkDir());
    
    this.gui.getCamera().setPos(this.playerPosition);
    this.generateChunks();

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
    // this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.chunk.cubePositions());
    // this.blankCubeRenderPass.drawInstanced(this.chunk.numCubes());    
    // Iterate over each chunk in the stack
    // console.log("drawScene 1\n");
    // for (const chunk of this.stackOfChunks.getChunks()) {
    this.stackOfChunks.forEach((chunk: Chunk, key: string) => {
      this.blankCubeRenderPass.updateAttributeBuffer('aOffset', chunk.cubePositions());
      this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
    });
  }

  public getGUI(): GUI {
    return this.gui;
  }  
  
  
  public jump() {
      //TODO: If the player is not already in the lair, launch them upwards at 10 units/sec.
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
