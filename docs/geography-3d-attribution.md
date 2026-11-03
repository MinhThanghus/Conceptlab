# Geography visual sources

The globe's surface uses the July 2004 Blue Marble: Next Generation base map by
Reto Stöckli, NASA Earth Observatory / NASA Goddard Space Flight Center.

- NASA collection: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/
- Source JPEG (5400 × 2700): https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg
- NASA media guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Original SHA-256: `f55226d46d27e05511f2118dc6aa24f5dbf9b6b2cddc87cc6e0e7dd067c00b11`.
- Locally bundled image: `frontend/public/geography/earth-blue-marble-200407.jpg`;
  converted to RGB, downsampled to 2048 × 1024 with Lanczos and compressed as JPEG.
  SHA-256: `a89c77071bc4de67837ea483a1aa395349d925f551a1c8df7554ad83681b8b3c`.

NASA states that its imagery is generally not subject to copyright in the US and
may be used for educational purposes under its media guidance; this does not
imply NASA endorsement. The surface is a static historical composite, not a live
satellite image. Day/night shading is calculated separately using the app's
approximate solar model; it is not part of the NASA image.

The water-cycle view uses the existing deterministic procedural
`createWaterCycleDiorama` factory. Its mountains, soil layers and water flows are
educational illustrations, not measured terrain or a real-world location. The
geometry/material choices and visual inspection were informed by the local
`img2threejs` geometry, shading, and review references; this is reuse and
refinement of an existing model, not a claim that its full image-reconstruction
gate was run or that any screenshot was reconstructed exactly.
