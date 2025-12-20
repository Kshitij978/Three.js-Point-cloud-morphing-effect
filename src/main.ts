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
      1000
    );
    this.camera.position.set(0, 10, 50);
    this.camera.lookAt(0, 0, 0);

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

    const material = new THREE.PointsMaterial({
      color: this.settings.currentColor,
      size: this.settings.particleSize,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  private async loadModels() {
    const loadModel = (name: string, path: string, scale: number) => {
      return new Promise<void>((resolve) => {
        this.loader.load(
          path,
          (obj) => {
            let mesh: THREE.Mesh | null = null;
            obj.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const m = child as THREE.Mesh;
                m.geometry.scale(scale, scale, scale);
                m.geometry.center();
                mesh = m;
              }
            });

            if (mesh) {
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
      loadModel("queen", "models/Queen.obj", 200),
      loadModel("pawn", "models/Pawn.obj", 250),
    ]);
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
    gsap.to((this.particles.material as THREE.PointsMaterial).color, {
      duration: 1,
      r: color.r,
      g: color.g,
      b: color.b,
      ease: "power2.out",
    });
    this.settings.currentColor = color;
  }

  private setupEvents() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Info toggle
    const infoPanel = document.getElementById("info-panel");
    const infoToggle = document.getElementById("info-toggle");
    if (infoPanel && infoToggle) {
      infoToggle.addEventListener("click", () => {
        infoPanel.classList.toggle("open");
      });
    }
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
        if (this.particles)
          (this.particles.material as THREE.PointsMaterial).size = val;
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

    this.updateStats();
    this.renderer.render(this.scene, this.camera);
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
