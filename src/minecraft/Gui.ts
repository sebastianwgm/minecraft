import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { MinecraftAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import {night_light} from "./App.js";
/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.01;
  private static readonly walkSpeed: number = 1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera: Camera;
  private prevX: number;
  private prevY: number;
  private dragging: boolean;

  private height: number;
  private width: number;

  private animation: MinecraftAnimation;
  
  private Adown: boolean;
  private Wdown: boolean;
  private Sdown: boolean;
  private Ddown: boolean;

  // block to be removed in case is valid
  private blockToRemove: Vec3;

  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: MinecraftAnimation) {
    this.height = canvas.height;
    this.width = canvas.width;
    this.prevX = 0;
    this.prevY = 0;
    this.dragging = false;
    
    this.animation = animation;
    
    this.reset();
    
    this.registerEventListeners(canvas);
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.camera = new Camera(
      new Vec3([0, 100, 0]),
      new Vec3([0, 100, -1]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.height,
      0.1,
      1000.0
    );
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }
  
  public getCamera(): Camera {
    return this.camera;
  }
  
  public dragStart(mouse: MouseEvent): void {
    // TODO: confirm dragging
    // if the player press the left button we try to remove the block
    if (mouse.button == 2) {
      // logic to modify the chunks
      this.animation.updateFieldWithRemovedCube(this.blockToRemove);
    } else {
      this.prevX = mouse.screenX;
      this.prevY = mouse.screenY;
      this.dragging = true;
    }
  }
  public dragEnd(mouse: MouseEvent): void {
      this.dragging = false;
  }

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;
    const dx = mouse.screenX - this.prevX;
    const dy = mouse.screenY - this.prevY;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
    if(this.dragging)
    {
        this.camera.rotate(new Vec3([0, 1, 0]), -GUI.rotationSpeed*dx);
        this.camera.rotate(this.camera.right(), -GUI.rotationSpeed*dy);
    }
    this.selectCube(x, y);
  }
  
  
  public walkDir(): Vec3
  {
      let answer = new Vec3;
      if(this.Wdown)
        answer.add(this.camera.forward().negate());
      if(this.Adown)
        answer.add(this.camera.right().negate());
      if(this.Sdown)
        answer.add(this.camera.forward());
      if(this.Ddown)
        answer.add(this.camera.right());
      answer.y = 0;
      answer.normalize();
      return answer;
  }
  
  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": {
        this.Wdown = true;
        break;
      }
      case "KeyA": {
        this.Adown = true;
        break;
      }
      case "KeyS": {
        this.Sdown = true;
        break;
      }
      case "KeyD": {
        this.Ddown = true;
        break;
      }
      case "KeyR": {
        this.animation.reset();
        break;
      }
      case "Space": {
        this.animation.jump();
        break;
      }
      // I: we decrease the velocity of which the day/night changes when pressin L
      case "KeyI": {
        night_light.change_velocity = night_light.change_velocity + 15;
        console.log("Decrease the velocity of day/nught, new value:", night_light.change_velocity);
        break;
      }
      // L: we increase the velocity of which the day/night changes when pressin L
      case "KeyL": {
        night_light.change_velocity = Math.max(night_light.change_velocity - 15, 10);
        console.log("Increase the velocity of day/nught, new value:", night_light.change_velocity);
        break;
      }
      // highlights the target cube
      case "KeyT": {
        this.animation.showCubes = !this.animation.showCubes;
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }
  
  public onKeyup(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": {
        this.Wdown = false;
        break;
      }
      case "KeyA": {
        this.Adown = false;
        break;
      }
      case "KeyS": {
        this.Sdown = false;
        break;
      }
      case "KeyD": {
        this.Ddown = false;
        break;
      }
    }
  }  

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );
    
    window.addEventListener("keyup", (key: KeyboardEvent) =>
      this.onKeyup(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );
    
    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }
  // TODO: FIXFIXFIXFIXFIXFIX
  public selectCube(x: number, y: number): void {
    const NDCm: Vec4 = new Vec4([(x / this.width) * 2 - 1, 1 - (y / this.height) * 2, -1, 1]);
    const Projm: Vec4 = this.projMatrix().inverse().multiplyVec4(NDCm);
    let worldM: Vec4 = this.viewMatrix().inverse().multiplyVec4(Projm);
    worldM.scale(1 / worldM.w);
    const ray: Vec3 = Vec3.difference(new Vec3(worldM.xyz), this.camera.pos()).normalize();
    const origin: Vec3 = this.camera.pos();
    // TODO: confirm if the value work
    let radius = 3.0;
    ray.scale(radius);
    const blockToRemove: Vec3 = Vec3.sum(origin, ray);
    this.blockToRemove = new Vec3([Math.round(blockToRemove.x), Math.round(blockToRemove.y), Math.round(blockToRemove.z)]);
    this.animation.updateCubeToRemove(this.blockToRemove);
  }
}
