import { Matrix4, Vector3 } from 'three'

// Galactic → ICRS directions from Astropy SkyCoord(..., frame='galactic').icrs,
// expressed in our equatorial scene (+X RA 270°, +Y NCP, -Z RA 0°).
// https://docs.astropy.org/en/stable/coordinates/transforming.html
// Texture axes: +X=(l=0°, b=0°), +Y=north Galactic pole, +Z=(l=270°, b=0°).
// Thus longitude increases leftward across the panorama (u = 0.5 - l / 360°).
// This aligns the illustrative band, not its synthetic clouds or brightness.
// The parent EquatorialFrame supplies approximate date/observer orientation;
// this decorative layer must never be used for astrometry or FITS registration.
export const GALACTIC_FRAME = new Matrix4().makeBasis(
  new Vector3(0.8734370519556162, -0.4838350736167156, 0.0548756577125922),
  new Vector3(0.1980763372730006, 0.4559838136873021, 0.8676661375596585),
  new Vector3(-0.4448297212232954, -0.7469821839866677, 0.4941094371927269),
)
