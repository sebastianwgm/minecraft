In this project, Lamha and I developed a procedural walking simulator inspired by Minecraft, featuring both CPU-based terrain generation and GPU-accelerated procedural texture synthesis utilizing Perlin noise. For the terrain, we employed multi-octave value noise to generate a 3x3 seamless chunk region around the initial player location.

<img width="1186" alt="Screenshot 2024-04-20 at 5 43 14 PM" src="https://github.com/sebastianwgm/minecraft/assets/122843474/6bea8d23-1b09-4dc9-b218-3f29bf1bfd37">

We created procedural textures using both static and time-varying Perlin noise. 

https://github.com/sebastianwgm/minecraft/assets/122843474/e24a5eed-6946-4a2c-abc9-ef1f6a9cd4b3

Additionally, we pioneered the use of 3D Perlin noise for true volumetric terrain generation. To render the terrain blocks, we applied 3D Perlin noise with variable opacity settings to selectively draw cubes, enhancing the volumetric effect. The implementation is similar to 2D perlin noise except that we implemented the 3D perlin noise on the CPU instead of the GPU:

<img width="1219" alt="VolumetricTerrainGeneration" src="https://github.com/sebastianwgm/minecraft/assets/122843474/cf9d920e-e198-4804-884d-d16b3a82cd9f">
