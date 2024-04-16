export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
    }
`;
export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    
    float random (in vec2 pt, in float seed) {
        return fract(sin( (seed + dot(pt.xy, vec2(12.9898,78.233))))*43758.5453123);
    }
    
    vec2 unit_vec(in vec2 xy, in float seed) {
        float theta = 6.28318530718 * random(xy, seed);
        return vec2(cos(theta), sin(theta));
    }
    
    float smoothmix(float a0, float a1, float w) {
        return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
    }

    // Implement a perlin() shader function
    // which takes in a random seed, a position (u,v)
    // in barycentric coordinates on a unit square 0≤u,v≤1
    // and a grid spacing, and outputs the value of Perlin noise at that position.
    //float perlin(float seed, vec2 uv, float grid_spacing) {
    float perlin(vec2 uv, float seed, float grid_spacing, float toNormalize) {
        vec2 grid = vec2(floor(uv.x * grid_spacing), floor(uv.y * grid_spacing));
        vec2 uvFract = uv * grid_spacing;
        float result = 0.0;
        vec2 unit_vec_s = unit_vec(grid, seed);
        vec2 unit_vec_t = unit_vec(grid + vec2(1.0,0.0), seed);
        vec2 unit_vec_u = unit_vec(grid + vec2(0.0,1.0), seed);
        vec2 unit_vec_v = unit_vec(grid + vec2(1.0,1.0), seed);
        vec2 offset_s = uvFract - vec2(0.0,0.0);
        vec2 offset_t = uvFract - vec2(1.0,0.0);
        vec2 offset_u = uvFract - vec2(0.0,1.0);
        vec2 offset_v = uvFract - vec2(1.0,1.0);
        
        float s = dot(offset_s, unit_vec_s);
        float t = dot(offset_t, unit_vec_t);
        float u = dot(offset_u, unit_vec_u);
        float v = dot(offset_v, unit_vec_v);

        float varX = grid.x + 1.0 - uvFract.x;
        float varY = grid.y + 1.9 - uvFract.y;

        float smoothx = smoothmix(s, t, 1.0 - varX);
        float smoothy = smoothmix(u, v, 1.0 - varX);
        float smoothz = smoothmix(smoothx, smoothy, 1.0 - varY);

        // It should be in the range [0.1]
        if (toNormalize == 1.0) {
            return abs(smoothz) + 0.5;
        }
        return smoothz * 0.5 + 0.5; 
        // return smoothmix(smoothx, smoothy, uvFract.y);
    }

    // Marble-like texture function
    // TODO: maybe add another interpolation instead of sin
    float marbleTexture(vec2 uv, float seed) {
        float noiseBase = perlin(uv * 3.0, seed, 10.0, 1.0);
        return sin(uv.x * 10.0 + noiseBase * 10.0);
    }

    // Wood grain texture function
    float woodTexture(vec2 uv, float seed) {
        float noise = 0.0;
        float frequency = 1.0;
        float amplitude = 1.0;
        for (int i = 0; i < 5; i++) {
            noise += amplitude * perlin(uv * frequency, seed, 20.0, 1.0);
            frequency *= 2.0;
            amplitude *= 0.5;
        }
        return noise;
    }

    void main() {

        vec3 kd = vec3(1.0, 1.0, 1.0);
        vec3 ka = vec3(0.1, 0.1, 0.1);

        float seed = 12.0;
        float noise = perlin(uv * 10.0, seed, 0.5, 1.0);
        float marble = marbleTexture(uv, seed);
        float wood = woodTexture(uv, seed);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
        dot_nl = clamp(dot_nl, 0.0, 1.0);
        
        if (wsPos.y < 33.33) {
            vec3 color = vec3(180.0 / 256.0, 230.0 / 256.0, 230.0 / 256.0);
            vec3 woodTexture = color * wood;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd * woodTexture, 0.0, 1.0), 1.0);
        } else if (wsPos.y < 56.66) {
            vec3 color = vec3(144.0 / 256.0, 238.0 / 256.0, 144.0 / 256.0);
            vec3 marbleTexture = color * marble;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd * marbleTexture, 0.0, 1.0), 1.0);
        } else {
            vec3 textureColor = mix(vec3(marble), vec3(wood, wood, noise), 0.5);
            vec3 finalColor = ka + dot_nl * kd * textureColor;
            gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
        }
        
    }
`;
//# sourceMappingURL=Shaders.js.map