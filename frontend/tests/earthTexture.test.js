/**
 * Earth texture orientation contract (visual revamp phase C).
 *
 * The scene is Earth-fixed: geodeticToScene(lat, lon) places lon=0 on +x and
 * increases toward +z. three's SphereGeometry maps its u attribute through
 * lam_scene(u) = 180 - 360u (EMPIRICAL, pinned here), while equirectangular
 * textures carry lam_tex(s) = -180 + 360s. Raw sampling mirrors longitudes;
 * the flip s(u) = 1 - u (texture.repeat.x = -1, offset.x = 1) makes
 * lam_tex(s(u)) == lam_scene(u) exactly — pinned for every u below so a
 * three.js upgrade cannot silently rotate or mirror the planet.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { geodeticToScene } from '../src/lib/coords.js'

const RAD = 180 / Math.PI

function nearestEquator(geo, uTarget) {
  const pos = geo.attributes.position, uv = geo.attributes.uv
  let best = -1, bd = Infinity
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(uv.getY(i) - 0.5) > 1e-9) continue // equator row
    const d = Math.abs(uv.getX(i) - uTarget)
    if (d < bd) { bd = d; best = i }
  }
  if (best < 0) throw new Error('no equator vertex near u')
  // return the vertex's ACTUAL u — geometry is a finite grid; the identity
  // must hold for whatever u the vertex really carries, not the search target.
  return {
    u: uv.getX(best),
    lon: Math.atan2(pos.getZ(best), pos.getX(best)) * RAD,
  }
}

describe('sphere UV -> scene longitude convention', () => {
  const geo = new THREE.SphereGeometry(1, 36, 18)
  for (const [u, lon] of [[0, 180], [0.25, 90], [0.5, 0], [0.75, -90]]) {
    it(`raw u=${u} lands at scene lon ${lon} (lambda = 180 - 360u)`, () => {
      const v = nearestEquator(geo, u)
      expect(v.lon).toBeCloseTo(180 - 360 * v.u, 4)
      expect(v.lon).toBeCloseTo(lon, 0)
    })
  }
  it('flipped sampling (repeat.x=-1, offset.x=1) matches the equirectangular convention', () => {
    // sample coordinate s = u * repeat.x + offset.x = 1 - u; texture longitude
    // of s is -180 + 360 s. Assert it equals the scene longitude of each vertex.
    for (const u of [0, 0.1, 0.25, 0.4, 0.5, 0.62, 0.75, 0.9, 1]) {
      const v = nearestEquator(geo, u)
      const s = v.u * -1 + 1
      const lamTex = -180 + 360 * s
      const wrap = ((v.lon - lamTex + 540) % 360) - 180 // seam-safe compare
      expect(wrap).toBeCloseTo(0, 4)
    }
  })
  it('north pole (uv.y=1 with default flipY) is +y — image top row = north', () => {
    const pos = geo.attributes.position, uv = geo.attributes.uv
    let iTop = -1
    for (let i = 0; i < pos.count; i++) {
      if (uv.getY(i) > 0.99 && pos.getY(i) > 0.99) { iTop = i; break }
    }
    expect(iTop).toBeGreaterThan(-1)
    const v = geodeticToScene(90, 0, 0, new THREE.Vector3()).normalize()
    expect(pos.getY(iTop)).toBeCloseTo(v.y, 6)
  })
})
