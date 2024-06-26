In this project, Lamha and I developed and enhanced a procedural walking simulator inspired by Minecraft. Our objectives included allowing block mining and crafting, gamifying the world, and introducing fractal trees into the landscape using L-systems. Furthermore, the walking simulator was produced featuring both CPU-based terrain generation and GPU-accelerated procedural texture synthesis utilizing Perlin noise. For the terrain, we employed multi-octave value noise to generate a 3x3 seamless chunk region around the initial player location.

<strong>Requirements:</strong> WebGL 2.0 TypeScript

<strong>Build the project:</strong>
Run the python script make-minecraft.py

<strong>Launch the HTTP server:</strong> from the project directory containing dist/ run the following command: http-server dist -c-1

<strong>Gameplay:</strong> The goal of the game is to collect golden block as much as you can, every collected golden block will give you one point, however, if the player moves towards or step on top of a lava block, the player will lose all their points. To remove and/or add a block, the player should use the mouse right click. The player is not allow to place a cube without removing a cube beforehand, the top left blocks counter shows

<img width="716" alt="Screenshot 2024-05-07 at 6 23 22 PM" src="https://github.com/sebastianwgm/minecraft/assets/122843474/8b3cafb7-d439-41b6-9876-61b05ac30e69">

<strong>Introducing Fractal Trees:</strong>
We add fractal trees to the landscape using L-Systems. Lindenmayer-Systems (often called L-Systems) are essentially a mathematical theory of plant/trees development. They often use “turtle geometry”, where each symbol in the L-System defines a movement for the turtle, like move forward, turn right etc. The L-System has a start string, and some rewriting rules. At each iteration. all symbols in the current string (starting with the start string) are replaced using the rewriting rules. As an example, a simple system could be:
Start String: F
Rules: F → F + F
On the first iteration, our current string will change to: F + F
On second iteration, it will update to: F +F +F +F and so on.
For further information please refer to the end of this document.
<img width="714" alt="Screenshot 2024-05-07 at 6 22 46 PM" src="https://github.com/sebastianwgm/minecraft/assets/122843474/900af94b-6335-4949-ad8e-9b02730f2a79">
<img width="713" alt="Screenshot 2024-05-07 at 6 22 37 PM" src="https://github.com/sebastianwgm/minecraft/assets/122843474/4d551d99-3eb0-4283-853d-80204c8b8dbc">

We created procedural textures using both static and time-varying Perlin noise. 

https://github.com/sebastianwgm/minecraft/assets/122843474/e24a5eed-6946-4a2c-abc9-ef1f6a9cd4b3

Additionally, we pioneered the use of 3D Perlin noise for true volumetric terrain generation. To render the terrain blocks, we applied 3D Perlin noise with variable opacity settings to selectively draw cubes, enhancing the volumetric effect. The implementation is similar to 2D perlin noise except that we implemented the 3D perlin noise on the CPU instead of the GPU:

<img width="1219" alt="VolumetricTerrainGeneration" src="https://github.com/sebastianwgm/minecraft/assets/122843474/cf9d920e-e198-4804-884d-d16b3a82cd9f">

<strong>Mining and crafting blocks:</strong> 
To “detect” what cube location the user is pointing to before removing or adding a block, we take the NDC mouse position, translate it to the world coor- dinates, and then we use the difference between the mouse and camera position scale by a 3.0 size radius to get the targeting block.
We allow the player to mine the blocks. The player can then place the mined blocks anywhere (craft blocks). We show the inventory count of the blocks and the total points on the screen. To enhance the gaming experience and simplify block placement and removal, players can press the ‘T’ key to highlight the currently selected block position, making it easier to see where a block will be placed or removed. Furthermore, we established a radius of 3.0 units from the player to the potential block removal or insertion point. We chose this distance since it resulted in a more realistic gameplay.

<strong>Gamifying the world:</strong>
To gamify the minecraft world, we use the mining feature we added, and the goal for the player is to mine gold blocks to obtain points. To make this difficult for the user, we also add lava blocks around these gold blocks. The lava blocks keep moving every 2 seconds to further make it hard for the player. If the player touches the lava, or stands over it, all the points are forefeited. The goal of the game is to obtain maximum points.
To distinguish between types of blocks we created a new array containing the type of block (lava, golden, regular and fractal tree blocks). We pass this array to the GPU in order to color accordingly (we also pass to the GPU an array containing the highlighted block). To place the golden blocks, we randomly choose at most 64 blocks per chunk every time we initialize. Once the process finish, we surround these blocks with at most one lava block with P robability = 0.3. We update the position of these ‘enemies’ every second by updating the type array and textures considering the previous position of the lava block.

<strong>Fractal trees: </strong>
For implementing fractal trees using L-Systems, we first needed to find L- Systems that represented 3D trees. We used two different L-Systems - this allowed us to have a greater variety in the trees in our landscape. The details of both the L-Systems can be found in our code: the constants at the beginning of App.ts define the L-Systems.
For both systems, we fixed the depth (i.e., how many times to apply rewriting rules) and the angle that produced good results.
We apply the rewriting rules iteratively till the required depth is reached. After obtaining the string at the given depth, we generate “branches”. These branches represent the turtle’s movement when it draws a branch (symbol F) or leaf (symbol *). Particularly, we capture the turtle’s start and end positions, and use this to display a cube corresponding to the branch. We choose a step size of 0.2 for the turtle to make cubes overlap each other so that the tree looks more dense. We allow randomization of the angle to allow for variation in different trees, the angle increases or decreases by a factor of 1.2 or 1.4 or stays the same. The 5 cases have equal probability (0.2 each). This, combined with two different L-Systems, meant that each tree in the landscape would be unique!
