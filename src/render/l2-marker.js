// A high-contrast, labelled Sun-Earth L2 marker for the Roman mission scenes.
//
// Both scenes previously marked L2 with a thin blue-grey cross at 0.44-0.62
// opacity, which is legible on a bright screen and effectively invisible in a
// screenshot pasted into a slide. This draws the same geometry in a colour that
// nothing else in these scenes uses, and adds a text label.
//
// Colour note: bright yellow reads as the Sun or as Webb's amber trajectory in
// these views, so the marker is green. It is deliberately outside the palette
// used for bodies (blue/orange), Roman (purple) and Webb (amber).
//
// The marker is an annotation, not trajectory: it is drawn without depth
// testing so it stays readable when a body or a path passes in front of it.
// That is not licence to disable depth testing on anything that represents a
// physical path -- see docs/SPEC.md section 4.

import * as THREE from 'three';

export const L2_MARKER_COLOR = 0x4dffa3;

const LABEL_ASPECT = 2;
const RENDER_ORDER = 90;

function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 74px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // A dark halo keeps the label readable over the Sun, Earth or a bright path.
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(2,6,12,0.92)';
  ctx.strokeText(text, 128, 68);
  ctx.fillStyle = '#8dffc4';
  ctx.fillText(text, 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * @param {object} options
 * @param {number} options.armLength   half-length of each axis tick, scene units
 * @param {number} options.ringRadius  radius of the ring facing the Sun-Earth line
 * @param {string} options.text        label text
 * @param {number} options.labelScreenFraction
 *        label height as a fraction of viewport height, held constant by
 *        `update(camera)` so it stays readable at any zoom.
 * @returns {{group: THREE.Group, update: (camera: THREE.PerspectiveCamera) => void}}
 */
export function createL2Marker({
  armLength = 0.2,
  ringRadius = 0.3,
  text = 'L2',
  labelScreenFraction = 0.030,
} = {}) {
  const group = new THREE.Group();

  const lineMaterial = new THREE.LineBasicMaterial({
    color: L2_MARKER_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });

  const cross = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-armLength, 0, 0), new THREE.Vector3(armLength, 0, 0),
      new THREE.Vector3(0, -armLength, 0), new THREE.Vector3(0, armLength, 0),
      new THREE.Vector3(0, 0, -armLength), new THREE.Vector3(0, 0, armLength),
    ]),
    lineMaterial,
  );
  cross.renderOrder = RENDER_ORDER;
  group.add(cross);

  // Ring in the plane perpendicular to the Sun-Earth line, matching how the
  // observatory scene draws L2.
  const ringPoints = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return new THREE.Vector3(0, Math.cos(a) * ringRadius, Math.sin(a) * ringRadius);
  });
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(ringPoints),
    lineMaterial,
  );
  ring.renderOrder = RENDER_ORDER;
  group.add(ring);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTexture(text),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  // Anchor at the bottom edge so the label grows upward from just above the ring.
  label.center.set(0.5, 0);
  label.position.set(0, ringRadius * 1.1, 0);
  label.renderOrder = RENDER_ORDER + 1;
  group.add(label);

  const markerWorld = new THREE.Vector3();
  const groupScale = new THREE.Vector3();

  function update(camera) {
    if (!camera?.isPerspectiveCamera) return;
    group.getWorldPosition(markerWorld);
    group.getWorldScale(groupScale);
    const distance = camera.position.distanceTo(markerWorld);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    // Height in world units that covers `labelScreenFraction` of the viewport.
    const worldHeight = labelScreenFraction * 2 * distance * Math.tan(halfFov);
    const local = worldHeight / (groupScale.y || 1);
    label.scale.set(local * LABEL_ASPECT, local, 1);
    label.position.y = ringRadius * 1.1;
  }

  return { group, update };
}
