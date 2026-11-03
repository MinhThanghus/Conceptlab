# Heart model attribution

The heart model in `frontend/public/models/bodyparts3d/heart.glb` is a curated
subset of BodyParts3D 4.0. BodyParts3D, © The Database Center for Life Science,
is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/),
as specified by the [official BodyParts3D license page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).

The bundled asset and its [attribution](../frontend/public/models/bodyparts3d/ATTRIBUTION.md)
and [manifest](../frontend/public/models/bodyparts3d/manifest.json) were retrieved from
[OrganUI Heart](https://github.com/organui/heart-3d/tree/c72ce6654ff8e282942f97750d3104f55ef4fc3d),
commit `c72ce6654ff8e282942f97750d3104f55ef4fc3d`. OrganUI selected and grouped
source meshes, triangulated, recentered and scaled them, changed axes, recomputed
normals, applied illustrative colors, and converted the files to GLB. ConceptLab
displays the unmodified GLB with its own camera, lighting and visibility controls.

The GLB is 2,524,400 bytes; SHA-256:
`b80a727d022a4ab07ccfcf15caccc228eaccb6d69ec0e72923324946ac35a946`.
The upstream attribution notes that older source-file comments mention CC BY-SA
2.1 Japan, while the current official archive specifies CC BY 4.0. The model
license is separate from the upstream project's MIT code license.

This simplified reference is based on an adult male model; valves, atrial
cavities, most veins, and surrounding structures are omitted. Ventricular cavity
surfaces are spaces rather than heart muscle. Anatomical expert review remains
pending, and the model is not a physiological simulation or patient-specific
representation. DBCLS does not endorse ConceptLab.
