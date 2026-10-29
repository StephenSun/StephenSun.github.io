# AVPS-360

Audio-Visual Person Segmentation 360.

Project website: https://stephensun.github.io/AVPS-360/

The page presents the task, dataset statistics, and 1 Hz / 10 Hz video demos with person-mask overlays. The 360° player renders first-order Ambisonics audio binaurally.

## Annotation releases

- [Paper PDF](https://stephensun.github.io/AVPS-360/paper.pdf)
- [1 Hz and 10 Hz dev/eval annotations, version 3.0](https://zenodo.org/records/23761138)
- [STARSS23 source recordings](https://doi.org/10.5281/zenodo.7880637)

All annotation image paths use JPG filenames. The release includes 156 dev and 74 eval recordings at each rate.

## Website

This static website is published from `AVPS-360/` in the `main` branch of [StephenSun.github.io](https://github.com/StephenSun/StephenSun.github.io). No build step is required.

For local viewing, run `python -m http.server 8080` from this directory and visit `http://localhost:8080`.

Third-party licences are included in `vendor/`. The tab icon is the GitHub glyph from Simple Icons.
