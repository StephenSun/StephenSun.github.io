# Vendored JSAmbisonics

Upstream: https://github.com/polarch/JSAmbisonics
Commit: eb6780af42ff4d33829f3ceb299160e45d06542f
Licence: BSD-3-Clause; upstream LICENSE is preserved alongside these files.

Unmodified upstream files:

- `ambisonics.umd.js`: root browser bundle, including its bundled dependencies.
- `aalto2016_N1.wav`: `examples/IRs/ambisonic2binaural_filters/aalto2016_N1.wav`,
  the first-order HRTF decoding filter used in the upstream FOA player example.
- `LICENSE`: upstream root licence.

The browser bundle provides first-order SN3D-to-N3D conversion, scene rotation
and HRTF convolution. Filters expect ACN/N3D; source STARSS23 audio is ACN/SN3D.
The four filter channels are spherical-harmonic-domain decoding filters for the
left ear; the library reconstructs the right ear by reversing the sign of the
left/right-antisymmetric component.

SHA-256:

- Bundle: `0f8eadf4cad0dbc06bab3d03d329228ee9f244033c5f6fa9a978d62ab79111a6`
- HRTF: `5cff2d41958e5d39ee6d5e2f33b3dcca86ef1d63bdb20715d251b5861a4f6925`

Files are served locally; playback does not depend on an external CDN.
