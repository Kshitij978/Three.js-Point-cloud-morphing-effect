import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

export class ModelLoader {
  private loader: OBJLoader;

  constructor() {
    this.loader = new OBJLoader();
  }

  public async load(
    path: string,
    particleCount: number,
    onProgress?: (percent: number) => void
  ): Promise<Float32Array | null> {
    return new Promise((resolve) => {
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
            const points = this.samplePointsOnSurface(mesh, particleCount);
            resolve(points);
          } else {
            resolve(null);
          }
        },
        (xhr) => {
          if (xhr.total > 0 && onProgress) {
            onProgress((xhr.loaded / xhr.total) * 100);
          }
        },
        (error) => {
          console.error("Error loading model:", error);
          resolve(null);
        }
      );
    });
  }

  private normalizeMesh(mesh: THREE.Mesh, targetSize: number = 20) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
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
}
