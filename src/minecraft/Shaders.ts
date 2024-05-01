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
    varying vec2 TexCoords;

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        // TODO: confirm this
        TexCoords = (aVertPos.xy + aOffset.xy)* 0.5 + 0.5;
    }
`;

export const blankCubeFSText = `
    precision mediump float;

    uniform sampler2D gPosition;
    uniform sampler2D gNormal;
    uniform sampler2D texNoise;
    uniform sampler2D ssaoInput;

    uniform vec4 uLightPos;
    
    uniform float perlinTime;
    uniform float samples[64*3];
    varying vec2 TexCoords;
    // parameters (you'd probably want to use them as uniforms to more easily tweak the effect)
    const float kernelSize = 64.0;
    float radius = 0.5;
    float bias = 0.025;

    // tile noise texture over screen based on screen dimensions divided by noise size
    const vec2 noiseScale = vec2(800.0/4.0, 600.0/4.0); 

    uniform mat4 uProj;

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
    float perlin(vec2 uv, float seed, float grid_spacing) { 
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

        float smoothx = smoothmix(s, t, uvFract.x - grid.x);
        float smoothy = smoothmix(u, v, uvFract.x - grid.x);
        float smoothz = smoothmix(smoothx, smoothy, uvFract.y - grid.y);

        return smoothz + 0.5;
    }
    
    // time varying perlin noise
    vec2 unit_vec_with_perlin_time(in vec2 xy, in float seed) {
        float theta = perlinTime + 6.28318530718 * random(xy, seed);
        return vec2(cos(theta), sin(theta));
    }

    float timeVaryingPerlin(vec2 uv, float seed, float grid_spacing) { 
        vec2 grid = floor(uv * grid_spacing);
        vec2 uvFract = uv * grid_spacing;
        
        vec2 unit_vec_s = unit_vec_with_perlin_time(grid, seed);
        vec2 unit_vec_t = unit_vec_with_perlin_time(grid + vec2(1.0, 0.0), seed);
        vec2 unit_vec_u = unit_vec_with_perlin_time(grid + vec2(0.0, 1.0), seed);
        vec2 unit_vec_v = unit_vec_with_perlin_time(grid + vec2(1.0, 1.0), seed);

        float s = dot(uvFract - grid - vec2(0.0, 0.0), unit_vec_s);
        float t = dot(uvFract - grid - vec2(1.0, 0.0), unit_vec_t);
        float u = dot(uvFract - grid - vec2(0.0, 1.0), unit_vec_u);
        float v = dot(uvFract - grid - vec2(1.0, 1.0), unit_vec_v);

        float smoothx = smoothmix(s, t, uvFract.x - grid.x);
        float smoothy = smoothmix(u, v, uvFract.x - grid.x);
        float smoothz = smoothmix(smoothx, smoothy, uvFract.y - grid.y);

        return smoothz + 0.5;
    }

    // varying perling texture
    float tymeVaryingPerlinTexture(vec2 uv, float seed) {
        float noise = 0.0;
        float frequency = 3.0;
        float grid_spacing = 2.0;
        for (int i = 0; i < 4; i++) {
            noise += (timeVaryingPerlin(uv * frequency, seed, grid_spacing)) * (1.0 / grid_spacing);
            grid_spacing = grid_spacing * grid_spacing;
        }
        return noise;
    }

    // Using sin function
    float marbleTextureVarying(vec2 uv, float seed) {
        float noiseBase = timeVaryingPerlin(uv * 3.0, seed, 10.0);
        float x = uv.x * 10.0 + noiseBase * 10.0;
        float y = uv.y * 10.0 + noiseBase * 10.0;
        return sin(x + y);
    }

    float marbleTexture(vec2 uv, float seed) {
        float noiseBase = perlin(uv * 3.0, seed, 10.0);
        float x = uv.x * 10.0 + noiseBase * 10.0;
        float y = uv.y * 10.0 + noiseBase * 10.0;
        return sin(x + y);
    }

    float otherTextureForMix(vec2 uv, float seed) {
        float noiseBase = perlin(uv * 3.0, seed, 10.0);
        float x = (uv.x - noiseBase) * (uv.x - noiseBase);
        float y = (uv.y - noiseBase) * (uv.y - noiseBase);
        float result = sqrt(x + y);
        return sin(result);
    }

    float otherTextureForMixVarying(vec2 uv, float seed) {
        float noiseBase = timeVaryingPerlin(uv * 3.0, seed, 10.0);
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
        float grid_spacing = 2.0;
        for (int i = 0; i < 4; i++) {
            noise += (perlin(uv * frequency, seed, grid_spacing)) * (1.0 / grid_spacing);
            grid_spacing = grid_spacing * grid_spacing;
        }
        return noise;
    }

    float woodTextureVarying(vec2 uv, float seed) {
        float noise = 0.0;
        float frequency = 3.0;
        float grid_spacing = 2.0;
        for (int i = 0; i < 4; i++) {
            noise += (timeVaryingPerlin(uv * frequency, seed, grid_spacing)) * (1.0 / grid_spacing);
            grid_spacing = grid_spacing * grid_spacing;
        }
        return noise;
    }

    void main() {

        vec3 kd = vec3(1.0, 1.0, 1.0);
        // Diffuse term
        vec3 ka = vec3(0.5, 0.5, 0.5);
        float seed = 10.0;
        // float noise = perlin(uv, seed, 0.5);
        float marble = marbleTexture(uv, seed);
        // float wood = woodTexture(uv, seed);
        // float stripes = otherTextureForMix(uv, seed);
        // float mixed = noise * 0.5 + stripes * 0.25 + wood * 0.25;
        // TimeVarying for everything
        float timeVarying = tymeVaryingPerlinTexture(uv, seed);
        float noise = timeVaryingPerlin(uv, seed, 0.5);
        // float marble = marbleTextureVarying(uv, seed);
        float wood = woodTextureVarying(uv, seed);
        float stripes = otherTextureForMixVarying(uv, seed);
        float mixed = noise * 0.5 + stripes * 0.25 + wood * 0.25;
        
        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
        dot_nl = clamp(dot_nl, 0.0, 1.0);
        
        if (wsPos.y < 30.5) {
            vec3 textureColor = vec3(180.0, 87.0, 15.0) / 256.0;
            vec3 varyingTexture = textureColor * timeVarying;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* varyingTexture, 1.0);
        } else if (wsPos.y < 35.5) {
            vec3 color = vec3(144.0 / 256.0, 238.0 / 256.0, 144.0 / 256.0);
            vec3 marbleTexture = color * marble;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* marbleTexture, 1.0);
        } else {
            vec3 color = vec3(169.0 / 256.0, 163.0 / 256.0, 163.0 / 256.0);
            vec3 woodTexture = wood * color;
            gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* woodTexture, 1.0);
        }
        // ##############################################################################################################################
        // get input for SSAO algorithm
        vec3 fragPos = texture2D(gPosition, TexCoords).xyz;
        vec3 normal = normalize(texture2D(gNormal, TexCoords).rgb);
        vec3 randomVec = normalize(texture2D(texNoise, TexCoords * noiseScale).xyz);
        // create TBN change-of-basis matrix: from tangent-space to view-space
        vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
        vec3 bitangent = cross(normal, tangent);
        mat3 TBN = mat3(tangent, bitangent, normal);
        // iterate over the sample kernel and calculate occlusion factor
        float occlusion = 0.0;
        for(int i = 0; i < int(kernelSize); ++i)
        {
            // get sample position
            vec3 sample = vec3(samples[i + 0], samples[i + 1], samples[i + 2]);
            // vec3 samplePos = TBN * samples[i]; // from tangent to view-space
            vec3 samplePos = TBN * sample; // from tangent to view-space
            samplePos = fragPos + samplePos * radius; 
            
            // project sample position (to sample texture) (to get position on screen/texture)
            vec4 offset = vec4(samplePos, 1.0);
            // TODO: confirm uProj is correct
            offset = uProj * offset; // from view to clip-space
            offset.xyz /= offset.w; // perspective divide
            offset.xyz = offset.xyz * 0.5 + 0.5; // transform to range 0.0 - 1.0
            
            // get sample depth
            float sampleDepth = texture2D(gPosition, offset.xy).z; // get depth value of kernel sample
            
            // range check & accumulate
            // TODO: confirm smoothmix or smoothstep (they use this)
            // float rangeCheck = smoothstep(0.0, 1.0, radius / abs(fragPos.z - sampleDepth));
            float rangeCheck = smoothmix(0.0, 1.0, radius / abs(fragPos.z - sampleDepth));
            occlusion += (sampleDepth >= samplePos.z + bias ? 1.0 : 0.0) * rangeCheck;           
        }
        occlusion = 1.0 - (occlusion / kernelSize);
        // gl_FragColor = vec4(vec3(occlusion), 1.0);
        gl_FragColor = gl_FragColor * occlusion;

        // ##############################################################################################################################
        // ssao_blur
        // vec2 texelSize = 1.0 / vec2(textureSize(ssaoInput, 0));
        // float result = 0.0;
        // for (int x = -2; x < 2; ++x) 
        // {
        //     for (int y = -2; y < 2; ++y) 
        //     {
        //         vec2 offset = vec2(float(x), float(y)) * texelSize;
        //         result += texture(ssaoInput, TexCoords + offset).r;
        //     }
        // }
        // FragColor = result / (4.0 * 4.0);
        // ##############################################################################################################################
    }
`;
