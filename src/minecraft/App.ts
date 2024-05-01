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

const sizeOfTerrain = 64.0;
const radius = 0.4;
const maxHeightToCheck = 2.0;
const gravity = -9.8;

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
              const newChunk = new Chunk(xCoord, zCoord, chunkSize);
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
    const gl: WebGL2RenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    // ################################################################################################################
    // we attach the depth texture to the depthframebuffer
    let depth32FTexture = gl.createTexture();
    let depthFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
    
    gl.bindTexture(gl.TEXTURE_2D, depth32FTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT32F,
      1280,
      960,
      0,
      gl.DEPTH_COMPONENT,
      gl.FLOAT,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      depth32FTexture,
      0
    );
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // SSAO Kernel
    let ssaoKernel: Float32Array = this.generateSSAOKernel(64);
    // SSAO Noise
    let ssaoNoise = new Float32Array(16 * 3);
    for (let i = 0; i < 16; i++)
    {
      let sample = new Float32Array([
      Math.random() * 2.0 - 1.0, 
      Math.random() * 2.0 - 1.0, 
      0.0
      ]);
      ssaoNoise[i * 3 + 0] = sample[0];
      ssaoNoise[i * 3 + 1] = sample[1];
      ssaoNoise[i * 3 + 2] = sample[2];
    } 
    let ssaoRGB16NoiseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, ssaoRGB16NoiseTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB16F,
      4,
      4,
      0,
      gl.RGB,
      gl.FLOAT,
      ssaoNoise
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // we will create the SSAOFramebuffer and the two SSAO textures at initialization time
    let ssaoTexture = gl.createTexture();
    let ssaoBlurredTexture = gl.createTexture();
    let ssaoFramebuffer = gl.createFramebuffer();
    // TODO: confirm this:
    // If the precision isnt enough for good results in your case, then you can also use the gl.R32F 
    // internal format with gl.FLOAT data type.
    // raw tex
    gl.bindTexture(gl.TEXTURE_2D, ssaoTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      1280,
      960,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // blurred tex
    gl.bindTexture(gl.TEXTURE_2D, ssaoBlurredTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      1280,
      960,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // render loop
    let screenWidth = 1280;
    let screenHeight = 960;
    while(rendering) {
      // depth pre-pass start
      gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
      // issue draw calls for all visible geometry using a depth only shader.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // depth pre-pass end
    
        
        // SSAO pass start
        
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.TEXTURE_2D,
            null,
            0
        );
    // ssaoShaderProgram is the compiled WebGL shader program
        gl.useProgram(ssaoShaderProgram);
        gl.uniformMatrix4fv(
          gl.getUniformLocation(ssaoShaderProgram, `u_projection`),
          false,
          camera.getProjectionMatrix()
        );
        gl.uniformMatrix4fv(
          gl.getUniformLocation(ssaoShaderProgram, `u_projection_inverse`),
          false,
          camera.getProjectionInverseMatrix()
        );
        gl.activeTexture(gl.TEXTURE0 + 0);
        gl.bindTexture(gl.TEXTURE_2D, depth32FTexture);
        gl.uniform1i(
          gl.getUniformLocation(ssaoShaderProgram, `u_depthMap`),
          0
        );
        
        gl.activeTexture(gl.TEXTURE0 + 1);
        gl.bindTexture(gl.TEXTURE_2D, ssaoRGB16NoiseTexture);
        gl.uniform1i(
          gl.getUniformLocation(ssaoShaderProgram, `u_noise`),
          1
        );
        gl.uniform1f(
          gl.getUniformLocation(ssaoShaderProgram, `u_sampleRad`),
          // this the visibility radius in view space
      0.5
        );
        gl.uniform2f(
          gl.getUniformLocation(ssaoShaderProgram, `u_noiseScale`),
          screenWidth / 4,
          screenHeight / 4
        );
        gl.uniform3fv(
          gl.getUniformLocation(ssaoShaderProgram, `u_kernel`),
          ssaoKernel
        );
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          ssaoTexture,
          0
        );
    // here we clear the previously rendered values from the ssao raw texture
        gl.clear(gl.COLOR_BUFFER_BIT);

    // Here we draw a full screen quad using an already set up Vertex Array Object
        gl.bindVertexArray(quad_VAO);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

    // here we unbind the noise texture from the last active texture slot
    // i.e gl.TEXTURE0 + 1
        gl.bindTexture(gl.TEXTURE_2D, null);
        
        // Now our SSAO raw texture is populated with occlusion factor data
        
        // After this we will use the SSAO raw texture as input and blur the output to
        // the SSAO blur texture. We will use the gausian blur shader for this. To account
        // for depth when blurring so that geometry edges are not blurred into other geometry
    // we can use a bi-lateral blur algorithm which i have not discussed for simplicity.
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          ssaoBlurredTexture,
          0
        );
    // here we clear the previously rendered values from the ssao blur texture
        gl.clear(this.COLOR_BUFFER_BIT);
    // ssaoBlurShaderProgram is the compiled WebGL shader program for applying gausian blur
        gl.useProgram(ssaoBlurShaderProgram);
        gl.activeTexture(gl.TEXTURE0 + 0);
        gl.bindTexture(gl.TEXTURE_2D, ssaoTexture);
        gl.uniform1i(
          gl.getUniformLocation(ssaoBlurShaderProgram, `u_ssaoTexture`),
          0
        );
    // we again draw a full screen quad using the previously bound vertex array object
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // now we finally unbind the vertex array object
        gl.bindVertexArray(null);
        
        // SSAO pass end
    }
    // ################################################################################################################
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, 1280, 960);        
  }
  private ourLerp(a: number, b: number, f: number): number
  {
      return a + f * (b - a);
  }
  private generateSSAOKernel(sampleCount: number): Float32Array {
    let kernel = new Float32Array(sampleCount * 3);
    for (let i = 0; i < sampleCount; ++i) {
    let sample = new Float32Array([
      Math.random() * 2.0 - 1.0, 
      Math.random() * 2.0 - 1.0, 
      Math.random()
    ]);
    // normalize sample
    let magnitude = Math.sqrt(sample[0] ** 2 + sample[1] ** 2 + sample[2] ** 2);
    sample[0] /= magnitude;
    sample[1] /= magnitude;
    sample[2] /= magnitude;
    // After normaliztion the sample points lie on the surface of the hemisphere
    // and each sample point vector has the same length.
    // We want to randomly change the sample points to sample more 
    // points inside the hemisphere as close to our fragment as possible.
    // we will use an accelerating interpolation to do this.
    let scale = i / sampleCount; 
    // you can use a standard math library to perform the lerp function or 
    // write your own.
    let interpolatedScale = this.ourLerp(0.1, 1.0, scale * scale);
    sample[0] *= interpolatedScale;
    sample[1] *= interpolatedScale;
    sample[2] *= interpolatedScale;
    kernel[i * 3 + 0] = sample[0];
    kernel[i * 3 + 1] = sample[1];
    kernel[i * 3 + 2] = sample[2];  
    }
    return kernel;
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
      // If the player is not already in the lair, launch them upwards at 10 units/sec.
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

  

}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
