# Free 3D asset research

These are useful starting points, not an exhaustive survey. Always check the license and the specific download before adding an asset to a project.

| Candidate or library | What was considered | License / decision |
| --- | --- | --- |
| [Poly Haven: Dutch Ship Medium](https://polyhaven.com/a/dutch_ship_medium) | Detailed wooden sailing ship, roughly 69K triangles and 24.7 m tall. | CC0. **Included** with locally resized PBR maps; attribution and the precise source files are in [`assets/ship/README.md`](../assets/ship/README.md). |
| [Poly Haven: Ship Pinnace](https://polyhaven.com/a/ship_pinnace) | Another realistic sailing ship, roughly 184K triangles. | CC0, but substantially heavier for this small WebGL scene. Not included. |
| [Poly Haven: Dutch Ship Large 01](https://polyhaven.com/a/dutch_ship_large_01) | Larger historical ship, roughly 111K triangles. | CC0, but the medium ship is a better fit for the mobile and memory budget. Not included. |
| [ambientCG](https://ambientcg.com/) | Realistic materials and other 3D resources for future work. | See its [license](https://ambientcg.com/help/en/license); no asset from this library is included here. |
| [Sketchfab](https://sketchfab.com/) | A broad collection of community-uploaded 3D models. | Licenses vary by individual model; “free” alone does not imply permission to redistribute. No Sketchfab asset is included. |

A ship's visual mesh does not necessarily include a walkable interior. The chosen model provides open deck geometry but no modeled cabins, so Aqua exposes the usable deck and does not invent interior spaces.

## The eight ship classes

Aqua's fleet is one downloaded CC0 hull — Poly Haven's *Dutch Ship Medium* — re-proportioned per class in `js/ship.js` rather than eight separately downloaded models. The trade-offs were considered deliberately:

- **Licensing and attribution** stay simple: one asset, one licence, one provenance file (`assets/ship/README.md`), no mixed attribution requirements.
- **Materials and UVs** are already correct for that hull; recolouring timber, rigging and canvas per class is a uniform tint, whereas eight models would need eight texture sets and eight triangle budgets.
- **Collision and deck sampling** stay exact. `shipLocal`/`shipPoint` invert the same scale used by the mesh, so the walkable deck, ball contacts and first-person eye height are consistent at every class.
- **Download size** does not grow: the 5.4 MB asset is fetched once and the class is a saved number.

The lighter Poly Haven candidates (Pinnace, Dutch Ship Large 01) would each cost another several megabytes of runtime download for a silhouette change that the class system already provides. If a future class needs genuinely different topology (a lateen dhow hull, for example), the loader already handles multiple meshes and would only need another local asset and an entry in `SHIP_CLASSES`.
