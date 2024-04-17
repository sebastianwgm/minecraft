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
    float perlin(vec2 uv, float seed, float grid_spacing, float toNormalize) { 
        vec2 grid = floor(uv * grid_spacing);
        vec2 uvFract = uv * grid_spacing;
        
        vec2 unit_vec_s = unit_vec(grid, seed);
        vec2 unit_vec_t = unit_vec(grid + vec2(1.0, 0.0), seed);
        vec2 unit_vec_u = unit_vec(grid + vec2(0.0, 1.0), seed);
        vec2 unit_vec_v = unit_vec(grid + vec2(1.0, 1.0), seed);

        float s = dot(uvFract - grid - vec2(0.0, 0.0), unit_vec_s);
        float t = dot(uvFract - grid - vec2(1.0, 0.0), unit_vec_t);
        float u = dot(uvFract - grid - vec2(0.0, 1.0), unit_vec_u);
        float v = dot(uvFract - grid - vec2(1.0, 1.0), unit_vec_v);

        float varX = grid.x + 1.0 - uvFract.x;
        //float varX = 1.0 - fract(uv.x * grid_spacing);
        //float varY = 1.0 - fract(uv.y * grid_spacing);
        float varY = grid.y + 1.0 - uvFract.y;

        float smoothx = smoothmix(s, t, 1.0 - varX);
        float smoothy = smoothmix(u, v, 1.0 - varX);
        float smoothz = smoothmix(smoothx, smoothy, 1.0 - varY);

        if (toNormalize == 1.0) {
            //return normalize(smoothz);
            //return (smoothz + 1.0) * 0.5;  // Normalize to [0, 1]
            return abs(smoothz) + 0.5;
        }
        return smoothz;
    }

    // Marble-like texture function
    // Using sin function
    // TODO: maybe add another interpolation instead of sin
    float marbleTexture(vec2 uv, float seed) {
        float noiseBase = perlin(uv * 3.0, seed, 10.0, 1.0);
        float x = uv.x * 10.0 + noiseBase * 10.0;
        float y = uv.y * 10.0 + noiseBase * 10.0;
        // noiseBase = perlin(uv * 3.0, seed, 10.0, 1.0);
        // x = x + uv.x * 10.0 + noiseBase * 10.0;
        // y = y + uv.y * 10.0 + noiseBase * 10.0;
        // noiseBase = perlin(uv * 3.0, seed, 20.0, 1.0);
        // x = x + uv.x * 20.0 + noiseBase * 20.0;
        // y = y + uv.y * 20.0 + noiseBase * 20.0;
        return sin(x + y);
    }

    float otherTextureForMix(vec2 uv, float seed) {

        float noiseBase = perlin(uv * 3.0, seed, 10.0, 1.0);
        float x = (uv.x - noiseBase) * (uv.x - noiseBase);
        float y = (uv.y - noiseBase) * (uv.y - noiseBase);
        float result = sqrt(x + y);
        return sin(result);
    }

    // Wood grain texture function
    // Combining multiple octaves of Perlin noise
    float woodTexture(vec2 uv, float seed) {
        float noise = 0.0;
        float frequency = 3.0;
        // float amplitude = 1.0;
        float grid_spacing = 2.0;
        for (int i = 0; i < 4; i++) {
            noise += (perlin(uv * frequency, seed, grid_spacing, 1.0)) * (1.0 / grid_spacing);
            // frequency *= 2.0;
            // amplitude *= 0.5;
            grid_spacing = grid_spacing * grid_spacing;
        }
        return noise;
    }

    void main() {

        vec3 kd = vec3(1.0, 1.0, 1.0);
        vec3 ka = vec3(0.5, 0.5, 0.5);

        float seed = 10.0;
        float noise = perlin(uv, seed, 0.5, 1.0);
        float marble = marbleTexture(uv, seed);
        float wood = woodTexture(uv, seed);
        float stripes = otherTextureForMix(uv, seed);
        float mixed = noise * 0.5 + stripes * 0.25 + wood * 0.25;

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
        dot_nl = clamp(dot_nl, 0.0, 1.0);
        
        if (wsPos.y < 33.33) {
            vec3 textureColor = vec3(180.0, 87.0, 15.0) / 256.0;
            vec3 mixedTexture = textureColor * mixed;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* mixedTexture, 1.0);
        } else if (wsPos.y < 43.33) {
            vec3 color = vec3(144.0 / 256.0, 238.0 / 256.0, 144.0 / 256.0);
            vec3 marbleTexture = color * marble;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* marbleTexture, 1.0);
        } else {
            vec3 color = vec3(169.0 / 256.0, 163.0 / 256.0, 163.0 / 256.0);
            vec3 woodTexture = wood * color;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* woodTexture, 1.0);
        }
        
    }
`;
