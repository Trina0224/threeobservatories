import * as THREE from 'three';

// Three.js deliberately logs an error instead of throwing when add() receives
// undefined. The legacy renderer has a few optional objects that can be absent
// while asynchronous assets are loading, so filter only nullish/non-Object3D
// values at the shared boundary. This keeps real scene objects unchanged.
const currentAdd = THREE.Object3D.prototype.add;
if (!currentAdd.__threeObservatoriesGuard) {
  function guardedAdd(...objects) {
    return currentAdd.apply(this, objects.filter((object) => object instanceof THREE.Object3D));
  }
  guardedAdd.__threeObservatoriesGuard = true;
  THREE.Object3D.prototype.add = guardedAdd;
}
