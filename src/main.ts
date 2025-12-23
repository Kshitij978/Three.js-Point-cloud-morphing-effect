import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { gsap } from "gsap";

interface ParticleSettings {
  particleCount: number;
  particleSize: number;
  animationSpeed: number;
  autoRotate: boolean;
  morphDuration: number;
  currentColor: THREE.Color;
  autoMorph: boolean;
  autoMorphDuration: number;
}

class ParticleMorpher {
  private container: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private settings: ParticleSettings;
  private particles: THREE.Points | null = null;
  private readonly models: { [key: string]: Float32Array } = {};
  private currentShape: string = "queen";
  private isTransitioning: boolean = false;
  private loader: OBJLoader;
  private lastTime: number = 0;
  private lastMorphTime: number = 0;
  private mouse: THREE.Vector2 = new THREE.Vector2(-100, -100);
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseWorld: THREE.Vector3 = new THREE.Vector3();

  constructor() {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    if (!canvas) throw new Error("Canvas element not found");
    this.container = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030012);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.container,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Settings
    this.settings = {
      particleCount: 15000,
      particleSize: 1.2,
      animationSpeed: 1,
      autoRotate: true,
      morphDuration: 2.5,
      currentColor: new THREE.Color(0x088cff),
      autoMorph: true,
      autoMorphDuration: 5000,
    };

    this.loader = new OBJLoader();
    this.init();
  }

  private async init() {
    this.setupParticles();
    this.setupEvents();
    this.setupUI();

    await this.loadModels();
    this.hideLoader();

    this.morphTo("queen");
    this.animate();
  }

  private setupParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.settings.particleCount * 3);

    // Random initial positions
    for (let i = 0; i < this.settings.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const randoms = new Float32Array(this.settings.particleCount);
    for (let i = 0; i < this.settings.particleCount; i++) {
      randoms[i] = Math.random();
    }
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMouse: { value: new THREE.Vector3() },
        uRadius: { value: 3.0 },
        uStrength: { value: 10.0 },
        uColor: { value: this.settings.currentColor },
        uSize: { value: this.settings.particleSize },
        uOpacity: { value: 0.8 },
        uTime: { value: 0 },
      },
      vertexShader: `
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
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;

        void main() {
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  private async loadModels() {
    const loadModel = (name: string, path: string) => {
      return new Promise<void>((resolve) => {
        this.loader.load(
          path,
          (obj) => {
            let mesh: THREE.Mesh | null = null;
            obj.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                mesh = child as THREE.Mesh;
              }
            });

            if (mesh) {
              this.normalizeMesh(mesh);
              const points = this.samplePointsOnSurface(
                mesh,
                this.settings.particleCount
              );
              this.models[name] = points;
            }
            resolve();
          },
          (xhr) => {
            if (xhr.total > 0) {
              const percent = (xhr.loaded / xhr.total) * 100;
              const progressBar = document.getElementById("progress-bar");
              if (progressBar) progressBar.style.width = `${percent}%`;
            }
          }
        );
      });
    };

    await Promise.all([
      loadModel("queen", "models/Queen.obj"),
      loadModel("pawn", "models/Pawn.obj"),
    ]);
  }

  private normalizeMesh(mesh: THREE.Mesh, targetSize: number = 20) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    console.log(maxDim);
    if (maxDim > 0) {
      const scale = targetSize / maxDim;
      mesh.geometry.scale(scale, scale, scale);
    }
    mesh.geometry.center();
  }

  private samplePointsOnSurface(mesh: THREE.Mesh, count: number): Float32Array {
    const sampler = new MeshSurfaceSampler(mesh).build();
    const sampledPositions = new Float32Array(count * 3);
    const tempPosition = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      sampler.sample(tempPosition);
      sampledPositions[i * 3] = tempPosition.x;
      sampledPositions[i * 3 + 1] = tempPosition.y;
      sampledPositions[i * 3 + 2] = tempPosition.z;
    }

    return sampledPositions;
  }

  public morphTo(shape: string) {
    if (this.isTransitioning && shape !== "explode") return;
    if (!this.particles) return;
    this.isTransitioning = true;

    const targetPositions =
      shape === "explode" ? this.getExplodePositions() : this.models[shape];

    if (!targetPositions) {
      this.isTransitioning = false;
      return;
    }

    const currentPositions = this.particles.geometry.attributes.position
      .array as Float32Array;

    gsap.to(currentPositions, {
      duration: this.settings.morphDuration / this.settings.animationSpeed,
      endArray: targetPositions as any,
      ease: "expo.inOut",
      onUpdate: () => {
        if (this.particles)
          this.particles.geometry.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        this.isTransitioning = false;
        this.currentShape = shape;
        console.log(`Morphed to: ${this.currentShape}`);
      },
    });

    // Update UI active state
    document.querySelectorAll(".shape-btn").forEach((btn) => {
      (btn as HTMLElement).classList.toggle(
        "active",
        (btn as HTMLElement).dataset.shape === shape
      );
    });
  }

  private getExplodePositions(): Float32Array {
    const positions = new Float32Array(this.settings.particleCount * 3);
    for (let i = 0; i < this.settings.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
    }
    return positions;
  }

  private setColor(colorHex: string) {
    if (!this.particles) return;
    const color = new THREE.Color(colorHex);
    if (
      this.particles &&
      this.particles.material instanceof THREE.ShaderMaterial
    ) {
      gsap.to(this.particles.material.uniforms.uColor.value, {
        duration: 1,
        r: color.r,
        g: color.g,
        b: color.b,
        ease: "power2.out",
      });
    }
    this.settings.currentColor = color;
  }

  private setupEvents() {
    window.addEventListener("resize", () => this.handleResize());

    const updateMouse = (x: number, y: number) => {
      this.mouse.x = (x / window.innerWidth) * 2 - 1;
      this.mouse.y = -(y / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("mousemove", (e) =>
      updateMouse(e.clientX, e.clientY)
    );

    window.addEventListener(
      "touchstart",
      (e) => {
        const isCanvas = (e.target as HTMLElement).id === "canvas";
        if (e.touches.length > 0) {
          updateMouse(e.touches[0].clientX, e.touches[0].clientY);
        }
        if (isCanvas) e.preventDefault();
      },
      { passive: false }
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        const isCanvas = (e.target as HTMLElement).id === "canvas";
        if (e.touches.length > 0) {
          updateMouse(e.touches[0].clientX, e.touches[0].clientY);
        }
        if (isCanvas) e.preventDefault();
      },
      { passive: false }
    );

    const resetMouse = () => {
      this.mouse.set(-100, -100);
    };

    window.addEventListener("mouseleave", resetMouse);
    window.addEventListener("touchend", resetMouse);

    // Info toggle
    const infoPanel = document.getElementById("info-panel");
    const infoToggle = document.getElementById("info-toggle");
    if (infoPanel && infoToggle) {
      infoToggle.addEventListener("click", () => {
        infoPanel.classList.toggle("open");
      });
    }

    // Initial call to set correct size and aspect
    this.handleResize();
  }

  private handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.updateCameraPosition();
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private updateCameraPosition() {
    const aspect = this.camera.aspect;
    const fov = this.camera.fov;

    // Calculate distance needed to fit the model (targetSize = 20)
    const targetDim = 25;
    const fovRad = (fov * Math.PI) / 180;
    let dist;

    if (aspect >= 1) {
      dist = targetDim / (2 * Math.tan(fovRad / 2));
    } else {
      dist = targetDim / (aspect * 2 * Math.tan(fovRad / 2));
    }

    const finalDist = Math.max(dist, 40);
    this.camera.position.set(0, 10, finalDist);
    this.camera.lookAt(0, 0, 0);
  }

  private setupUI() {
    // Shape Buttons
    const queenBtn = document.getElementById("btn-queen");
    const pawnBtn = document.getElementById("btn-pawn");
    const explodeBtn = document.getElementById("btn-explode");

    if (queenBtn)
      queenBtn.addEventListener("click", () => this.morphTo("queen"));
    if (pawnBtn) pawnBtn.addEventListener("click", () => this.morphTo("pawn"));
    if (explodeBtn)
      explodeBtn.addEventListener("click", () => this.morphTo("explode"));

    // Speed Slider
    const speedSlider = document.getElementById(
      "speed-slider"
    ) as HTMLInputElement;
    const speedValue = document.getElementById("speed-value");
    if (speedSlider) {
      speedSlider.addEventListener("input", (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.settings.animationSpeed = val;
        if (speedValue) speedValue.textContent = `${val.toFixed(1)}x`;
      });
    }

    // Size Slider
    const sizeSlider = document.getElementById(
      "particle-size-slider"
    ) as HTMLInputElement;
    const sizeValue = document.getElementById("size-value");
    if (sizeSlider) {
      sizeSlider.addEventListener("input", (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        this.settings.particleSize = val;
        if (
          this.particles &&
          this.particles.material instanceof THREE.ShaderMaterial
        )
          this.particles.material.uniforms.uSize.value = val;
        if (sizeValue) sizeValue.textContent = val.toFixed(1);
      });
    }

    // Color buttons
    document.querySelectorAll(".color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".color-btn")
          .forEach((b) => b.classList.remove("active"));
        (btn as HTMLElement).classList.add("active");
        const color = (btn as HTMLElement).dataset.color;
        if (color) this.setColor(color);
      });
    });

    // Auto Rotate
    const autoRotateCheck = document.getElementById(
      "auto-rotate"
    ) as HTMLInputElement;
    if (autoRotateCheck) {
      autoRotateCheck.addEventListener("change", (e) => {
        this.settings.autoRotate = (e.target as HTMLInputElement).checked;
      });
    }

    // Auto Morph
    const autoMorphCheck = document.getElementById(
      "auto-morph"
    ) as HTMLInputElement;
    if (autoMorphCheck) {
      autoMorphCheck.checked = this.settings.autoMorph;
      autoMorphCheck.addEventListener("change", (e) => {
        this.settings.autoMorph = (e.target as HTMLInputElement).checked;
        if (this.settings.autoMorph) this.lastMorphTime = performance.now();
      });
    }

    // Fullscreen
    const fullscreenBtn = document.getElementById("fullscreen-btn");
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
          (e.target as HTMLElement).textContent = "Exit Fullscreen";
        } else {
          document.exitFullscreen();
          (e.target as HTMLElement).textContent = "Fullscreen";
        }
      });
    }
  }

  private hideLoader() {
    const loader = document.getElementById("loader");
    if (loader) {
      loader.classList.add("hidden");
      setTimeout(() => (loader.style.display = "none"), 800);
    }
  }

  private animate() {
    requestAnimationFrame(() => this.animate());

    if (this.settings.autoRotate && this.particles) {
      this.particles.rotation.y += 0.005 * this.settings.animationSpeed;
    }

    // Update mouse position in world space
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.raycaster.ray.intersectPlane(plane, this.mouseWorld);

    if (
      this.particles &&
      this.particles.material instanceof THREE.ShaderMaterial
    ) {
      this.particles.material.uniforms.uMouse.value.copy(this.mouseWorld);
      this.particles.material.uniforms.uTime.value = performance.now();
    }

    this.updateStats();
    this.handleAutoMorph();
    this.renderer.render(this.scene, this.camera);
  }

  private handleAutoMorph() {
    if (!this.settings.autoMorph || this.isTransitioning) return;

    const now = performance.now();
    if (now - this.lastMorphTime > this.settings.autoMorphDuration) {
      const morphKeys = Object.keys(this.models);
      if (morphKeys.length > 0) {
        const currentIndex = morphKeys.indexOf(this.currentShape);
        const nextIndex = (currentIndex + 1) % morphKeys.length;
        this.morphTo(morphKeys[nextIndex]);
        this.lastMorphTime = now;
      }
    }
  }

  private updateStats() {
    // Simple FPS counter
    if (!this.lastTime) this.lastTime = performance.now();
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    if (Math.random() > 0.9) {
      // Update text occasionally
      const fps = Math.round(1000 / delta);
      const fpsCounter = document.getElementById("fps-counter");
      if (fpsCounter) fpsCounter.textContent = fps.toString();
    }
  }
}

// Start the app
new ParticleMorpher();
