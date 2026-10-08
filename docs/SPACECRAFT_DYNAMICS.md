# OrbitalPulse — Spacecraft Dynamics

Scope: attitude geometry (M11) and reaction-wheel dynamics (M12). Services:
`frontend/src/lib/attitude.js`, `frontend/src/lib/wheels.js`. Tests:
`frontend/tests/attitude.test.js`, `frontend/tests/wheels.test.js`.
Validation rows: docs/VALIDATION.md.

## Frames

- **ECI**: satellite.js/natural Earth-centered inertial km state (from SGP4).
- **LVLH / RWFS** (roll-flight-sensing): Gram-Schmidt from r, v:
  ẑ = −r̂ (nadir), x̂ = normalize(v − (v·r̂)r̂) (along-track/roll axis),
  ŷ = ẑ×x̂ (= −orbit normal for prograde; wheel/pitch axis).
  Right-handed x̂×ŷ=ẑ. Degenerate states (zero r, radial-only v) throw.
- **Body**: intrinsic Z-Y-X yaw(ψ about ẑ) → pitch(θ about ŷ′) → roll(φ about
  x̂″): R_body→lvlh = Rz Ry Rx. Body axis i in ECI = Σ_j R[j][i]·LVLH_j.

## The orbit-rate fact (M11 core)

Torque-free inertial-hold: a body frozen in ECI sees the nadir axis recede
by EXACTLY the swept true anomaly — circular orbit: drift = n·t. Nadir
pointing therefore requires continuous body rotation at the orbit rate
about the wheel axis. Verified analytically in tests at 5/15/30 % of period.

## Wheel dynamics (M12)

State per axis: bus rate ω, wheel relative rate Ω, attitude quaternion q.
Motor torque is internal; commanding relative acceleration u:

    τ = u · I·Iw/(I+Iw)                (reduced-inertia coupling)
    ω̇ = ((J−K)ω₂ω₃ − τ)/I              (Euler equations, diagonal J=diag I)
    Ω̇ = u
    q̇ = ½ q ⊗ (0, ω)

Total momentum H = (I+Iw)ω + IwΩ is conserved (Ḣ ≡ 0 pointwise), so a
rest-start maneuver keeps H = 0: wheel absolute momentum is exactly the
bus momentum mirrored — asserted per sample to 1e-6 N·m·s.

Single-axis trapezoidal slew from rest (both ramps equal, |u| = a = τ/Iw):

    θ_final = (Iw/(I+Iw)) · a · t1²        t1 = sqrt(θ(I+Iw)/τ)
    ω_peak  = (Iw/(I+Iw)) · a · t1          H_wheel_abs_peak = I·ω_peak

Reaction direction: the wheel accelerates OPPOSITE the desired body
rotation (pinned in planSlew and by the settle test's sign).

Integrator: fixed-step RK4, dt = 0.02 s, segment-aligned to command
corners (u constant within each segment ⇒ RK4 nearly exact on the linear
rate ramps; a non-aligned grid showed a 2e-4 relative corner error before
alignment — the aligned version settles the commanded angle to <5e-3 deg).
Quaternion renormalized every step (unit-norm asserted at every sample).

Saturation demo honesty: planSlew reports peak required momentum vs the
wheel limit; the integrator deliberately continues past the limit so the
user SEES the infeasibility (labeled: a real bus would stop early and
desaturate — momentum dumping and gravity-gradient/desat control are out
of scope here).

## Validity limits (labels in the UI)

- BENCH: short maneuvers in a quasi-inertial frame; orbit-rate/pointing
  coupling is demonstrated separately in M11, not folded into the bench.
- No gravity-gradient, flex, friction, or magnetic torques; diagonal
  inertia assumed. SIMPLIFIED MODEL.
- Wheel RPM shown is relative wheel speed; absolute = ω + Ω (both charted).
