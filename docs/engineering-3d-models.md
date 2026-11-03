# Engineering teaching models

The quadrotor and solar-panel scenes are procedural ConceptLab illustrations.
Their shapes and dimensions are not measurements or models from the linked
papers. The local `img2threejs` geometry, material, and visual-review references
informed the mesh hierarchy, named components, lighting and screenshot checks;
these scenes are not represented as image reconstructions that passed the full
`img2threejs` reconstruction pipeline.

- **Quadrotor.** Four separate rotor assemblies and a tilting airframe are used
  to illustrate a total thrust vector and its two components,
  `F_vertical = F cos θ` and `F_horizontal = F sin θ`. The model does not
  integrate motion, gravity, drag, rotor dynamics or the nonlinear PID
  controller in [Goodarzi, Lee and Lee](https://arxiv.org/abs/1304.6765).
- **Solar module.** The separate glass, encapsulant, cells/contacts and
  backsheet/frame are a stylized teaching cutaway. The crack and light rays are
  illustrative. They do not predict output power, temperature or hotspots, and
  are not the specimens in [Dhimish and Hu](https://doi.org/10.1038/s41598-022-16546-z).

Both views provide a non-WebGL 2D fallback with controls and descriptions. The
WebGL review uses `e2e/engineering_3d_visual.py` to capture the real public 3D
catalog at desktop and phone viewport sizes in Chromium with SwiftShader. It
checks that changing controls and rotation changes the rendered pixels, and that
the fallback is usable. Software rendering does not replace testing on physical
devices or guarantee clinical/scientific expert review.
