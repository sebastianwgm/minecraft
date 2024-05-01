export const blankCubeVSText = `#version 300 es
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    uniform mat4 uProjInv;
    
    in vec4 aNorm;
    in vec4 aVertPos;
    in vec4 aOffset;
    in vec2 aUV;
    
    out vec4 normal;
    out vec4 wsPos;
    out vec2 uv;

    out vec2 texCoords;

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;

        // Change from [-1,1] to [0,1]
        texCoords = (gl_Position.xy * 0.5) + 0.5;
    }
`;

export const blankCubeFSText = `#version 300 es
    precision mediump float;

    const int MAX_KERNEL_SIZE = 20;
    const float INV_MAX_KERNEL_SIZE_F = 1.0/float(MAX_KERNEL_SIZE);
    const vec2 HALF_2 = vec2(0.5);
    // uniform mat4 u_projection;
    // uniform mat4 u_projection_inverse;

    uniform mat4 uProj;
    uniform mat4 uProjInv;

    uniform sampler2D u_depthMap;
    uniform sampler2D u_noise;
    // visibility radius
    uniform float u_sampleRad;
    uniform vec3 u_kernel[MAX_KERNEL_SIZE];
    uniform vec2 u_noiseScale;
    in vec2 texCoords;

    uniform vec4 uLightPos;
    
    uniform float perlinTime;
    
    in vec4 normal;
    in vec4 wsPos;
    in vec2 uv;

    out vec4 FragColor;

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

    // this function calculates view position of a fragment from its depth value
    // sampled from the depth texture.
    vec3 calcViewPosition(vec2 coords) {
        float fragmentDepth = texture(u_depthMap, coords).r;
    
        // Convert coords and fragmentDepth to 
        // normalized device coordinates (clip space)
        vec4 ndc = vec4(
        coords.x * 2.0 - 1.0, 
        coords.y * 2.0 - 1.0, 
        fragmentDepth * 2.0 - 1.0, 
        1.0
        );
        
        // Transform to view space using inverse camera projection matrix.
        // vec4 vs_pos = u_projection_inverse * ndc;
        vec4 vs_pos = uProjInv * ndc;
    
        // since we used a projection transformation (even if it was in inverse)
        // we need to convert our homogeneous coordinates using the perspective divide.
        vs_pos.xyz = vs_pos.xyz / vs_pos.w;
        
        return vs_pos.xyz;
    }

    float calcVisibilityFactor() {
        vec3 viewPos = calcViewPosition(texCoords);

        // the dFdy and dFdX are glsl functions used to calculate two vectors in view space 
        // that lie on the plane of the surface being drawn. We pass the view space position to these functions.
        // The cross product of these two vectors give us the normal in view space.
        vec3 viewNormal = cross(dFdy(viewPos.xyz), dFdx(viewPos.xyz));
        // vec3 viewNormal = vec3(1.0,0.0,0.0);

        // The normal is initilly away from the screen based on the order in which we calculate the cross products. 
        // Here, we need to invert it to point towards the screen by multiplying by -1. 
        // Then we normalize this vector to get a unit normal vector.
        viewNormal = normalize(viewNormal * -1.0);
        // we calculate a random offset using the noise texture sample. 
        //This will be applied as rotation to all samples for our current fragments.
        vec3 randomVec = texture(u_noise, texCoords * u_noiseScale).xyz; 
        // here we apply the Gramm-Schmidt process to calculate the TBN matrix 
        // with a random offset applied. 
        vec3 tangent = normalize(randomVec - viewNormal * dot(randomVec, viewNormal));
        vec3 bitangent = cross(viewNormal, tangent);
        mat3 TBN = mat3(tangent, bitangent, viewNormal); 
        float occlusion_factor = 0.0;
        for (int i = 0 ; i < MAX_KERNEL_SIZE ; i++) {
            vec3 samplePos = TBN * u_kernel[i];

            // here we calculate the sampling point position in view space.
            samplePos = viewPos + samplePos * u_sampleRad;

            // now using the sampling point offset
            vec4 offset = vec4(samplePos, 1.0);
            offset = uProj * offset;
            offset.xy /= offset.w;
            offset.xy = offset.xy * HALF_2 + HALF_2;

            // this is the geometry's depth i.e. the view_space_geometry_depth
            // this value is negative in my coordinate system
            float geometryDepth = calcViewPosition(offset.xy).z;
            
            float rangeCheck = smoothstep(0.0, 1.0, u_sampleRad / abs(viewPos.z - geometryDepth));
            
            // samplePos.z is the sample's depth i.e. the view_space_sampling_position depth
            // this value is negative in my coordinate system
            // for occlusion to be true the geometry's depth should be greater or equal (equal or less negative and consequently closer to the camera) than the sample's depth
            occlusion_factor += float(geometryDepth >= samplePos.z + 0.0001) * rangeCheck; 
        }

        // we will devide the accmulated occlusion by the number of samples to get the average occlusion value. 
        float average_occlusion_factor = occlusion_factor * INV_MAX_KERNEL_SIZE_F;
        
        float visibility_factor = 1.0 - average_occlusion_factor;

        // We can raise the visibility factor to a power to make the transition
        // more sharp. Experiment with the value of this power to see what works best for you.
        // Even after raising visibility to a power > 1, the range still remains between [0.0, 1.0].
        visibility_factor = pow(visibility_factor, 2.0);

        return visibility_factor;
    }

    void main() {

        float visFact = calcVisibilityFactor();

        vec3 kd = vec3(1.0, 1.0, 1.0);
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
            // gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* varyingTexture, 1.0);
            FragColor = vec4(clamp(ka * visFact + dot_nl * kd, 0.0, 1.0)* varyingTexture, 1.0);
        } else if (wsPos.y < 35.5) {
            vec3 color = vec3(144.0 / 256.0, 238.0 / 256.0, 144.0 / 256.0);
            vec3 marbleTexture = color * marble;
            // gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* marbleTexture, 1.0);
            FragColor = vec4(clamp(ka * visFact + dot_nl * kd, 0.0, 1.0)* marbleTexture, 1.0);
        } else {
            vec3 color = vec3(169.0 / 256.0, 163.0 / 256.0, 163.0 / 256.0);
            vec3 woodTexture = wood * color;
            // gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0)* woodTexture, 1.0);
            FragColor = vec4(clamp(ka * visFact + dot_nl * kd, 0.0, 1.0)* woodTexture, 1.0);
        }

        // FragColor = vec4(vec3(1.0, 1.0, 1.0) * visFact, 1.0);
        
    }
`;

// export const blankCubeVSText = `
// `;

// export const blankCubeFSText = `
// `;