export const vertexShader = `
  uniform vec3 uMouse;
  uniform float uRadius;
  uniform float uStrength;
  uniform float uSize;
  uniform float uTime;

  attribute float aRandom;

  float rand(vec3 co) {
    return fract(sin(dot(co.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }

  void main() {
    vec3 pos = position;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    
    float dist = distance(worldPosition.xyz, uMouse);
    
    // Smooth noise-like influence
    float time = uTime * 0.0005;
    float slowTime = uTime * 0.0002;
    
    float noise = aRandom;
    
    // Create an irregular, organic falloff
    float falloff = smoothstep(uRadius * (1.2 + noise * 0.5), 0.0, dist);
    
    if (falloff > 0.0) {
      // Smooth, drifty random direction
      vec3 randomDir = vec3(
        sin(pos.x * 0.15 + slowTime + noise * 6.28),
        cos(pos.y * 0.15 + slowTime * 1.1 + noise * 6.28),
        sin(pos.z * 0.15 + slowTime * 1.2 + noise * 6.28)
      );
      
      vec3 repelDir = normalize(worldPosition.xyz - uMouse);
      
      // Mix repel and chaos, biased towards chaos but more fluid
      vec3 finalDir = normalize(repelDir * 0.3 + randomDir * 0.7);
      
      // Apply displacement - reduced strength for more control
      float displacement = falloff * uStrength * (0.8 + sin(uTime * 0.001 + noise * 6.28) * 0.2);
      worldPosition.xyz += finalDir * displacement;
    }
    
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize;
  }
`;

export const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;
