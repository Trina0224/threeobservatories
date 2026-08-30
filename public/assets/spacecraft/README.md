# Spacecraft visual assets

Place the three original simulation illustrations in this folder using these filenames:

```text
public/assets/spacecraft/
  jwst.png
  roman.png
  hubble.png
```

These should be transparent-background PNGs used as the initial 2D/2.5D spacecraft representation before detailed 3D models are introduced.

## Asset policy

Preferred: original project artwork inspired by the real observatories.

Do not commit NASA logos, mission insignia, watermarked images, or third-party artwork unless the redistribution/license status is explicitly documented.

If an external image is ever used, add provenance here or in a sibling metadata file with:

- source URL
- creator/credit
- license or NASA usage statement
- retrieval date
- whether modified

## Rendering note

The artwork is a visual representation only. Spacecraft sprite/model scale must never be used as a physical dimension in orbital calculations.

The initial renderer may display these assets as camera-facing sprites or textured planes. Later, GLTF/GLB models may be added under:

```text
public/assets/spacecraft/models/
```

without changing the orbital data model.
