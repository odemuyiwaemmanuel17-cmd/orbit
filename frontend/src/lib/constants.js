/**
 * OrbitalPulse — centralized physical constants.
 *
 * Single source of truth for the aerospace math services. Units are encoded
 * in every name (ESAST convention-ish). Sources:
 *  - EGM-96 / WGS84: mu, J2, R_eq            (NIMA TR83.02, Vallado Table 8-4)
 *  - IAU-76/F51 system constants via Vallado (OmegaEarth)
 *  - CODATA: c, g0; NASA/SOLAR-C: solarConstantWm2
 * Do not scatter magic numbers elsewhere — import from here.
 */

export const DEG_PER_RAD = 180 / Math.PI
export const RAD_PER_DEG = Math.PI / 180

// Earth gravitational parameter [km^3/s^2] — EGM-96, consistent with the
// sgp4 library's km^3/s^2 internal units and satellite.js defaults.
export const MU_EARTH_KM3S2 = 398600.4418

// Earth radii [km]
export const R_EARTH_EQUATORIAL_KM = 6378.137 // WGS84 semi-major axis
export const R_EARTH_MEAN_KM = 6371.0 // IUGG mean radius (tracker geodetics)

// Second zonal harmonic of Earth's gravity field [-] (J2, EGM-96)
export const J2_EARTH = 1.08262668e-3

// Earth rotation rate [rad/s] (sidereal; WGS84)
export const OMEGA_EARTH_RADS = 7.2921159e-5

// Standard gravity [m/s^2] and speed of light [km/s]
export const G0_MS2 = 9.80665
export const C_KMS = 299792.458

// Total solar irradiance at 1 AU [W/m^2] (ASTM E490 / SORCE near-modern mean)
export const SOLAR_CONSTANT_WM2 = 1361

// Astronomical unit [km] and mean sun geocentric rate [deg/day] used for
// sun-synchronous / eclipse geometry (Meeus low-precision).
export const AU_KM = 1.495978707e8
export const SUN_MEAN_MOTION_DEGDAY = 0.98560028

// Sun nominal radius [km] (IAU 2015 nominal solar radius; sufficient for
// shadow-cone geometry, whose sensitivity to Rs is << the model's own error).
export const SUN_RADIUS_KM = 6.957e5

// Secular rates for reference comparisons
export const NODE_PRECESSION_SSO_RADSDAY = 2 * Math.PI / 365.2421897 / 86400 // +360 deg/yr in RAAN

// Link-budget noise constants.
// Boltzmann constant k = 1.380649e-23 J/K is EXACT since the 2019 SI
// redefinition, so its log form is unambiguous:
//   k_dbwPerK  = 10*log10(k)                    = -228.598 dBW/K/Hz
//   kDbmHz290  = 10*log10(k * 290 K) + 30       = -173.978 dBm/Hz
// 290 K is the ITU-R reference noise temperature (Rec. ITU-R P.1540/TSF).
export const K_DBW_PER_K = 10 * Math.log10(1.380649e-23)
export const K_DBM_HZ_290K = K_DBW_PER_K + 10 * Math.log10(290) + 30

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
