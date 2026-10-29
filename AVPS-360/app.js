"use strict";

const heroSlides = [...document.querySelectorAll("[data-hero-slide]")];
const heroSlideButtons = [...document.querySelectorAll("[data-hero-index]")];
const heroToggle = document.querySelector("#hero-toggle");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let heroIndex = 0;
let hero = heroSlides[heroIndex];
let heroWantsPlayback = !motionPreference.matches;
let heroSwitch = 0;
let pendingHero = null;
function updateHeroControl() {
  const paused = !heroWantsPlayback;
  const icon = document.querySelector("#hero-toggle-icon");
  icon.classList.toggle("icon-play", paused);
  icon.classList.toggle("icon-pause", !paused);
  document.querySelector("#hero-toggle-label").textContent = paused ? "Play" : "Pause";
  heroToggle.setAttribute("aria-label", `${paused ? "Play" : "Pause"} background videos`);
}
function pauseHero() {
  heroWantsPlayback = false;
  ++heroSwitch;
  pendingHero = null;
  heroSlides.forEach(video => video.pause());
  updateHeroControl();
}
function playHero() {
  heroWantsPlayback = true;
  updateHeroControl();
  if (hero.ended) {
    showHeroSlide((heroIndex + 1) % heroSlides.length);
    return;
  }
  const change = ++heroSwitch;
  hero.play().catch(() => {
    if (change !== heroSwitch) return;
    heroWantsPlayback = false;
    updateHeroControl();
  });
}
async function showHeroSlide(index) {
  if (index === heroIndex) {
    if (pendingHero) {
      ++heroSwitch;
      pendingHero.pause();
      pendingHero = null;
    }
    return;
  }
  const change = ++heroSwitch;
  const previous = hero;
  const next = heroSlides[index];
  if (pendingHero && pendingHero !== next) pendingHero.pause();
  pendingHero = next;
  next.currentTime = 0;
  if (heroWantsPlayback) {
    try {
      // Keep the previous frame visible until the next video starts playing.
      await next.play();
    } catch {
      if (change === heroSwitch) {
        pendingHero = null;
        heroWantsPlayback = !previous.paused && !previous.ended;
        updateHeroControl();
      }
      return;
    }
  }
  if (change !== heroSwitch) {
    if (next !== hero && next !== pendingHero) next.pause();
    return;
  }
  hero = next;
  heroIndex = index;
  pendingHero = null;
  heroSlides.forEach(video => {
    video.classList.toggle("is-active", video === hero);
    if (video !== hero) video.pause();
  });
  heroSlideButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.heroIndex) === heroIndex));
  });
  updateHeroControl();
}
heroSlides.forEach(video => {
  video.muted = true;
  video.addEventListener("ended", () => {
    if (video === hero && heroWantsPlayback) showHeroSlide((heroIndex + 1) % heroSlides.length);
  });
});
heroSlideButtons.forEach(button => {
  button.addEventListener("click", () => showHeroSlide(Number(button.dataset.heroIndex)));
});
heroToggle.addEventListener("click", () => heroWantsPlayback ? pauseHero() : playHero());
if (motionPreference.matches) {
  hero.removeAttribute("autoplay");
  pauseHero();
} else playHero();

const sampleVideo = document.querySelector("#sample-video");
const sampleButtons = [...document.querySelectorAll("[data-sample]")];
const samples = {
  room23: {
    label: "Conversation and movement",
    videoPrefix: "assets/moving-person",
    poster: "assets/moving-poster.webp",
    audio: "assets/moving-person-foa.wav"
  },
  room17: {
    label: "Lecture-room movement",
    videoPrefix: "assets/room17",
    poster: "assets/room17-poster.webp",
    audio: "assets/room17-foa.wav"
  }
};
let activeSample = "room23";
let activeRate = "10";
let videoChange = 0;
let pendingVideoRestore = null;
function showSample(sampleId, rate) {
  if (sampleId === activeSample && rate === activeRate) return;
  const changedSample = sampleId !== activeSample;
  const sample = samples[sampleId];
  const previousTime = changedSample ? 0 : (pendingVideoRestore?.time ?? (sampleVideo.currentTime || 0));
  const wasPlaying = pendingVideoRestore?.playing ?? !sampleVideo.paused;
  const change = ++videoChange;
  if (pendingVideoRestore) sampleVideo.removeEventListener("loadedmetadata", pendingVideoRestore.restore);
  sampleVideo.pause();
  activeSample = sampleId;
  activeRate = rate;
  sampleButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.sample === sampleId));
  });
  document.querySelectorAll(".rate-button").forEach(item => {
    const active = item.dataset.rate === rate;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  sampleVideo.setAttribute("aria-label", `${sample.label}: annotated panoramic video at ${rate} Hz`);
  document.querySelector("#rate-badge").textContent = `${rate} Hz`;
  document.querySelector("#rate-description").textContent = rate === "10"
    ? "10 annotated frames per second · 100 ms annotation interval"
    : "1 annotated frame per second · 1 s annotation interval";
  document.querySelector("#sample-description").textContent = `${sample.label} · colours distinguish person instances`;
  const restore = () => {
    sampleVideo.removeEventListener("loadedmetadata", restore);
    if (change !== videoChange) return;
    sampleVideo.currentTime = Math.min(previousTime, Math.max(0, sampleVideo.duration - 0.05));
    pendingVideoRestore = null;
    if (wasPlaying) sampleVideo.play().catch(() => {});
  };
  pendingVideoRestore = { time: previousTime, playing: wasPlaying, restore };
  sampleVideo.addEventListener("loadedmetadata", restore);
  sampleVideo.poster = sample.poster;
  sampleVideo.dataset.foaSrc = sample.audio;
  if (changedSample) sampleVideo.dispatchEvent(new Event("samplechange"));
  const source = `${sample.videoPrefix}-${rate}hz.mp4`;
  document.querySelector("#sample-download").href = source;
  sampleVideo.src = source;
  sampleVideo.load();
}
sampleButtons.forEach(button => {
  button.addEventListener("click", () => showSample(button.dataset.sample, activeRate));
});
document.querySelectorAll(".rate-button").forEach(button => {
  button.addEventListener("click", () => showSample(activeSample, button.dataset.rate));
});
sampleVideo.addEventListener("error", () => {
  document.querySelector("#rate-description").textContent = "The video preview could not be loaded.";
});

const citations = {
  "paper": `@misc{sun2026avps360,
  author    = {Sun, Yifu and Sudarsanam, Parthasaarathy and
               Virtanen, Tuomas and Politis, Archontis},
  title     = {{AVPS-360}: A Spatial Audio-Visual Benchmark for Instance
               Segmentation and Tracking of Sound-Producing Persons},
  year      = {2026},
  note      = {Preprint},
  url       = {https://stephensun.github.io/AVPS-360/paper.pdf}
}`,
  "data": `@dataset{sun2026avps360annotations,
  author    = {Sun, Yifu and Sudarsanam, Parthasaarathy and
               Virtanen, Tuomas and Politis, Archontis},
  title     = {{AVPS-360}: Audio-Visual Person Segmentation 360 (1 Hz and 10 Hz)},
  year      = {2026},
  publisher = {Zenodo},
  version   = {3.0},
  doi       = {10.5281/zenodo.23761138}
}`,
  "starss23": `@inproceedings{shimada2023starss23,
  author    = {Shimada, Kazuki and Politis, Archontis and
               Sudarsanam, Parthasaarathy and Krause, Daniel A. and
               Uchida, Kengo and Adavanne, Sharath and Hakala, Aapo and
               Koyama, Yuichiro and Takahashi, Naoya and Takahashi, Shusuke and
               Virtanen, Tuomas and Mitsufuji, Yuki},
  title     = {{STARSS23}: An Audio-Visual Dataset of Spatial Recordings of
               Real Scenes with Spatiotemporal Annotations of Sound Events},
  booktitle = {Advances in Neural Information Processing Systems},
  volume    = {36},
  pages     = {72931--72957},
  year      = {2023},
  url       = {https://proceedings.neurips.cc/paper_files/paper/2023/hash/e6c9671ed3b3106b71cafda3ba225c1a-Abstract.html}
}`
};
const citationCode = document.querySelector("#citation-code");
const copyButton = document.querySelector("#copy-citation");
let copyReset;
document.querySelectorAll(".citation-tab").forEach(button => {
  button.addEventListener("click", () => {
    citationCode.textContent = citations[button.dataset.citation];
    document.querySelectorAll(".citation-tab").forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    clearTimeout(copyReset);
    copyButton.textContent = "Copy BibTeX ⧉";
  });
});
copyButton.addEventListener("click", async () => {
  let copied = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(citationCode.textContent);
      copied = true;
    } else {
      const field = document.createElement("textarea");
      field.value = citationCode.textContent;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      copied = document.execCommand("copy");
      field.remove();
    }
  } catch { copied = false; }
  copyButton.textContent = copied ? "Copied ✓" : "Select text to copy";
  document.querySelector("#copy-status").textContent = copied ? "BibTeX citation copied to clipboard." : "Could not access the clipboard. Select and copy the citation text below.";
  clearTimeout(copyReset);
  copyReset = setTimeout(() => { copyButton.textContent = "Copy BibTeX ⧉"; }, 2200);
});
