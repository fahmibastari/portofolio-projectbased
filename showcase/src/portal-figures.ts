import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Imported appearance asset; origin records are retained with local project notes.
export async function createFigureGeometry() {
  const model = await new GLTFLoader().loadAsync("/assets/mascot.glb");
  model.scene.updateMatrixWorld(true);
  let geometry: THREE.BufferGeometry | undefined;
  model.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!geometry) geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
  if (!geometry) throw new Error("Character asset contains no mesh");
  const result = geometry as THREE.BufferGeometry;
  result.computeBoundingBox();
  const box = result.boundingBox!, center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  result.translate(-center.x, -center.y, -center.z).scale(1 / height, 1 / height, 1 / height);
  if (!result.hasAttribute("normal")) result.computeVertexNormals();
  return result;
}
