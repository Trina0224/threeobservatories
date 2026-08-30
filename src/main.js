import * as THREE from 'three';

// Cleanup shim for the L2 thermal-geometry view.
// The previous revision created two translucent PlaneGeometry cues that read as
// large floating rectangles in oblique/iPad views. Suppress only those two cue
// dimensions before loading the main renderer; the L2 reference plane remains.
const originalAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objects) {
  const filtered = objects.filter((obj) => {
    const p = obj?.geometry?.parameters;
    if (obj?.geometry?.type !== 'PlaneGeometry' || !p) return true;
    const webbCue = Math.abs(p.width - 2.0) < 1e-6 && Math.abs(p.height - 1.15) < 1e-6;
    const romanCue = Math.abs(p.width - 1.0) < 1e-6 && Math.abs(p.height - 0.64) < 1e-6;
    return !(webbCue || romanCue);
  });
  return originalAdd.apply(this, filtered);
};

await import('./main-core.js?v=20260830p');
