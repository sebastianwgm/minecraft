import { Mat3, Mat4, Quat, Vec3 } from "../lib/TSM.js";


export class Lsystems {
    private segmentLength: number;
    private turnAngle: number;
    private startString: string;
    private transformRules: Map<string, string>;
    private curString: string;
    private depthWiseString: string[]
    private turtle: Turtle;
    private branches: TreeBranch[];
    private turtleMaxMoves: number;

    // Should save the start string (depth 0), and the rules to be able to process these later. 
    constructor(startString: string, transformRules: Map<string, string>, segmentLength: number = 1, turnAngle: number = 30 /* in degrees */) {
        this.startString = startString;
        this.transformRules = transformRules ?? new Map<string, string>();
        this.segmentLength = segmentLength;
        this.turnAngle = turnAngle;
        this.depthWiseString = new Array(...[startString]);
        this.turtle = new Turtle(null, null, null, null);
        this.turtle.rotateAxisLeft(-90); // To make the turtle face up at beginning
        this.branches = [];
        this.turtleMaxMoves = 0;
    }

    public getSegmentLength(): number {
        return this.segmentLength;
    }
    
    public getBranches(): TreeBranch[] {
        return this.branches;
    }

    public getMaxMoves(): number {
        return this.turtleMaxMoves;
    }

    private getrandAngle(): number{
        let p = Math.random();
        if(p>0&&p<0.2){return this.turnAngle/1.4;}
        else if(p>0.2&&p<0.4){return this.turnAngle/1.2;}
        else if(p>0.4&&p<0.6){return this.turnAngle;}
        else if(p>0.6&&p<0.8){return this.turnAngle*1.2;}
        return this.turnAngle*1.4;
    }


    // This includes both: expanding the expression string in the L system, and drawing out the resultant string
    public processForDepth(depth: number) {
        let stringAtDepth: string;
        let curLen = this.depthWiseString.length;
        if (curLen <= depth) {
            let out = this.depthWiseString[curLen-1];
            for (let i = curLen; i<= depth; i++) {
                out = this.unrollRulesOnce(out);
                this.depthWiseString.push(out);
            }
        }
        // Now we have the string at required depth
        stringAtDepth = this.depthWiseString[depth];
        // console.log(stringAtDepth);

        // Now we need to draw the corresponding fractal using the "turtle"

        let stack = new Array();
        for (const char of stringAtDepth) {
            switch(char) {
                case "*": // We wanna mark the previous branch as a leaf
                    this.branches[this.branches.length-1].markAsLeaf();
                    break;
                case "F": // Move forward while drawing
                    // TODO: Record the tree branch
                    let startBranch = this.turtle.getPos().copy();
                    this.turtle.move(this.segmentLength);
                    this.turtleMaxMoves = Math.max(this.turtle.getMoves(), this.turtleMaxMoves);
                    let endBranch = this.turtle.getPos().copy();
                    this.branches.push(new TreeBranch(startBranch, endBranch, this.turtle.getMoves()))
                    break;
                case "f": // Move forward without drawing
                    this.turtle.move(this.segmentLength);
                    this.turtleMaxMoves = Math.max(this.turtle.getMoves(), this.turtleMaxMoves);
                    break;
                case "+": // Turn left by some angle
                    this.turtle.rotateAxisUp(this.getrandAngle());
                    break;
                case "-": // Turn right by some angle
                    this.turtle.rotateAxisUp(-1*this.getrandAngle());
                    break;
                case "&": // Pitch down by some angle
                    this.turtle.rotateAxisLeft(this.getrandAngle());
                    break;
                case "^": // Pitch up by some angle
                    this.turtle.rotateAxisLeft(-1*this.getrandAngle());
                    break;
                case "\\": // Roll left by some angle
                    this.turtle.rotateAxisHeading(this.getrandAngle());
                    break;
                case "/": // Roll right by some angle
                    this.turtle.rotateAxisHeading(-1*this.getrandAngle());
                    break;
                case "|": // Turn around
                    // TODO: check
                    this.turtle.rotateAxisUp(180)
                    break;
                case "[": // Save current configuration of the turtle to be able to revert back
                    let curTurtle = this.turtle.copy();
                    stack.push(curTurtle);
                    break;
                case "]": // Restore the last saved configuration of the turtle
                    this.turtle = stack.pop();
                    break;
                case "A":
                case "L":
                case "S":
                case "M": break;
                default: console.error("Invalid string: ", char);
                    break;
            }
        }

        // console.log(this.branches);
    }

    private unrollRulesOnce(inString: string): string {
        let outString: string = "";
        for (const char of inString) {
            if (this.transformRules.has(char)) {
                outString += this.transformRules.get(char);
            }
            else {
                outString += char;
            }
        }
        return outString;
    }

    // TODO: Add randomization
}

// Could use radians for angles, but most L systems talk about angle in degrees, so easier to just do the conversion here.
class Turtle {
    private pos: Vec3;
    private heading: Vec3; // The direction turtle is facing/looking at
    private left: Vec3; // Left direction of the turtle
    private up: Vec3; // Up direction for the turtle
    private curTransform: Mat4; // Represents overall transformation
    private numOfMovesDone: number;

    constructor(pos: Vec3 | null, heading: Vec3 | null, left: Vec3 | null, up: Vec3 | null) {
        this.pos = pos ?? new Vec3([0, 0, 0]);
        this.heading = heading ?? new Vec3([0, 0, -1]); // Into the screen z = -1 direction
        this.left = left ?? new Vec3([-1, 0, 0]);
        this.up = up ?? new Vec3([0, 1, 0]);
        this.curTransform = Mat4.identity.copy();
        this.numOfMovesDone = 0;
    }

    public getPos(): Vec3 {
        return this.pos;
    }

    public getMoves(): number {
        return this.numOfMovesDone;
    }

    public setCurTransform(inp: Mat4) {
        this.curTransform = inp;
    }
    
    public setMoves(numOfMovesDone: number) {
        this.numOfMovesDone = numOfMovesDone;
    }

    public move(steps: number) {
        let dirAndMag = this.heading.copy().scale(steps);
        this.pos = Vec3.sum(this.pos, dirAndMag);
        // let dirAndMag = Vec3.difference(newPos, this.pos); // TODO: Does this need to be the other way around?

        this.curTransform.translate(dirAndMag);
        this.numOfMovesDone++;
    }

    // TODO: Check for all rotations if need to reorder matrix and vertex
    // TODO: Check if multiplyPt3 or multiplyVec3
    public rotateAxisUp(angle: number /* in degrees */) {
        // Left/right
        let angleInRad = (angle * Math.PI)/180;
        let rotMatrix = Quat.fromAxisAngle(this.up, angleInRad).toMat4();
        // let rotMatrix = Mat4.identity.rotate(angleInRad, this.up);
        this.curTransform.rotate(angleInRad, this.up);
        this.left = rotMatrix.multiplyVec3(this.left);
        this.heading = rotMatrix.multiplyVec3(this.heading);
    }

    public rotateAxisLeft(angle: number /* in degrees */) {
        // Pitch up/down
        let angleInRad = (angle * Math.PI)/180;
        let rotMatrix = Quat.fromAxisAngle(this.left, angleInRad).toMat4();
        // let rotMatrix = Mat4.identity.rotate(angleInRad, this.left);
        this.curTransform.rotate(angleInRad, this.left);
        this.up = rotMatrix.multiplyVec3(this.up);
        this.heading = rotMatrix.multiplyVec3(this.heading);
    }

    public rotateAxisHeading(angle: number /* in degrees */) {
        // Roll left/right
        let angleInRad = (angle * Math.PI)/180;
        let rotMatrix = Quat.fromAxisAngle(this.heading, angleInRad).toMat4();
        // let rotMatrix = Mat4.identity.rotate(angleInRad, this.heading);
        this.curTransform.rotate(angleInRad, this.heading);
        this.left = rotMatrix.multiplyVec3(this.left);
        this.up = rotMatrix.multiplyVec3(this.up);
    }

    public copy(dest?: Turtle): Turtle {
        if (!dest) {
          dest = new Turtle(this.pos.copy(), this.heading.copy(), this.left.copy(), this.up.copy());
        }

        dest.setCurTransform(this.curTransform.copy());
        dest.setMoves(this.numOfMovesDone);

        return dest;
      }

}

class TreeBranch {
    private start: Vec3;
    private end: Vec3;
    private numOfMoves: number;
    private leaf: boolean;

    constructor(start: Vec3, end: Vec3, numOfMoves: number) {
        this.start = start;
        this.end = end;
        this.numOfMoves = numOfMoves;
        this.leaf = false;
    }

    public getStart(): Vec3 {
        return this.start;
    }

    public getEnd(): Vec3 {
        return this.end;
    }

    public getNumOfMoves(): number {
        return this.numOfMoves;
    }

    public markAsLeaf() {
        this.leaf = true;
    }

    public isLeaf(): boolean {
        return this.leaf;
    }
}