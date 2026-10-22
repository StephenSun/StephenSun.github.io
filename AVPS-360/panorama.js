import * as THREE from "./vendor/three/three.module.min.js";
import { SpatialAudio } from "./spatial-audio.js";

// Both views share one video element. Changing annotation rate preserves
// its timeline and audio settings, and never resets the camera.
const stage = document.querySelector("#panorama-player");
const video = document.querySelector("#sample-video");
const canvas = document.querySelector("#panorama-canvas");
const view360 = document.querySelector("#view-360");
const viewFlat = document.querySelector("#view-flat");
const controls = document.querySelector("#viewer-controls");
const navigation = document.querySelector("#viewer-navigation");
const help = document.querySelector("#viewer-help");
const status = document.querySelector("#viewer-status");
const playButton = document.querySelector("#viewer-play");
const muteButton = document.querySelector("#viewer-mute");
const fullscreenButton = document.querySelector("#viewer-fullscreen");
const seek = document.querySelector("#viewer-seek");
const time = document.querySelector("#viewer-time");
const DEFAULT_VIEW = { yaw: 180, pitch: -15, fov: 80 };
const view = { ...DEFAULT_VIEW };
const spatialAudio = new SpatialAudio(video, document.querySelector("#audio-preview-note"));
const target = new THREE.Vector3();
let renderer, scene, camera, material, videoTexture, posterTexture;
let frameRequest = 0;
let mode = "flat";
let inView = true;
let scrubbing = false;
let disposed = false;

function showFlat(message = "") {
  mode = "flat";
  spatialAudio.setView(mode, view.yaw, view.pitch);
  stage.classList.remove("is-360");
  canvas.hidden = controls.hidden = navigation.hidden = help.hidden = true;
  video.controls = true;
  video.removeAttribute("aria-hidden");
  video.removeAttribute("tabindex");
  viewFlat.classList.add("is-active");
  viewFlat.setAttribute("aria-pressed", "true");
  view360.classList.remove("is-active");
  view360.setAttribute("aria-pressed", "false");
  status.textContent = message;
  status.hidden = !message;
  cancelAnimationFrame(frameRequest);
  frameRequest = 0;
}

function unavailable(message) {
  showFlat(message);
  view360.disabled = true;
  view360.title = message;
}

function invalidate() {
  spatialAudio.setView(mode, view.yaw, view.pitch);
  if (!disposed && mode === "360" && inView && !document.hidden && !frameRequest) {
    frameRequest = requestAnimationFrame(render);
  }
}

function render() {
  frameRequest = 0;
  if (disposed || mode !== "360" || !inView || document.hidden) return;
  const phi = THREE.MathUtils.degToRad(90 - view.pitch);
  const theta = THREE.MathUtils.degToRad(view.yaw);
  target.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  camera.lookAt(target);
  renderer.render(scene, camera);
  if (!video.paused && !video.ended) invalidate();
}

function resize() {
  if (!renderer || mode !== "360") return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  invalidate();
}

function show360() {
  if (!renderer || view360.disabled) return;
  mode = "360";
  stage.classList.add("is-360");
  canvas.hidden = controls.hidden = navigation.hidden = help.hidden = false;
  video.controls = false;
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("tabindex", "-1");
  view360.classList.add("is-active");
  view360.setAttribute("aria-pressed", "true");
  viewFlat.classList.remove("is-active");
  viewFlat.setAttribute("aria-pressed", "false");
  status.hidden = true;
  resize();
  invalidate();
}

function setZoom(fov) {
  view.fov = THREE.MathUtils.clamp(fov, 35, 105);
  camera.fov = view.fov;
  camera.updateProjectionMatrix();
  invalidate();
}

function resetView() {
  Object.assign(view, DEFAULT_VIEW);
  setZoom(view.fov);
}

function mapVideoFrame() {
  if (!material || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  if (!videoTexture) {
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    material.map = videoTexture;
    material.needsUpdate = true;
  }
  videoTexture.needsUpdate = true;
  invalidate();
}

function clock(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function updateControls() {
  const playing = !video.paused && !video.ended;
  const icon = document.querySelector("#viewer-play-icon");
  icon.classList.toggle("icon-play", !playing);
  icon.classList.toggle("icon-pause", playing);
  playButton.setAttribute("aria-label", playing ? "Pause video" : "Play video");
  muteButton.textContent = video.muted ? "Muted" : "Sound on";
  muteButton.setAttribute("aria-label", video.muted ? "Unmute audio" : "Mute audio");
  muteButton.setAttribute("aria-pressed", String(video.muted));
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  seek.disabled = duration <= 0;
  seek.max = String(duration || 10.1);
  if (!scrubbing) seek.value = String(video.currentTime || 0);
  seek.setAttribute("aria-valuetext", `${clock(video.currentTime)} of ${clock(duration)}`);
  time.textContent = `${clock(video.currentTime)} / ${clock(duration)}`;
}

function togglePlayback() {
  if (video.paused || video.ended) {
    void spatialAudio.activate();
    video.play().catch(() => {
      status.textContent = "Playback could not start. Try Play again or use the equirectangular view.";
      status.hidden = false;
      updateControls();
    });
  } else video.pause();
}

function setup() {
  if (location.protocol === "file:") {
    unavailable("Open this page through a web server to enable 360° playback.");
    return;
  }
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x172123);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera = new THREE.PerspectiveCamera(view.fov, 16 / 9, 0.1, 100);
    scene = new THREE.Scene();
    posterTexture = new THREE.TextureLoader().load(video.poster, invalidate);
    posterTexture.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.MeshBasicMaterial({ map: posterTexture, toneMapped: false });
    const sphere = new THREE.SphereGeometry(10, 64, 40);
    sphere.scale(-1, 1, 1);
    scene.add(new THREE.Mesh(sphere, material));
  } catch {
    unavailable("360° playback is unavailable in this browser. Use the equirectangular player.");
    return;
  }

  // Resume Web Audio directly inside trusted user gestures, including native
  // video controls in equirectangular mode after spatial audio was initialized.
  for (const event of ["pointerdown", "keydown"]) {
    stage.addEventListener(event, () => { void spatialAudio.activate(); }, { capture: true });
  }

  view360.disabled = false;
  view360.removeAttribute("title");
  view360.addEventListener("click", show360);
  viewFlat.addEventListener("click", () => showFlat());
  document.querySelector("#zoom-in").addEventListener("click", () => setZoom(view.fov - 8));
  document.querySelector("#zoom-out").addEventListener("click", () => setZoom(view.fov + 8));
  document.querySelector("#reset-view").addEventListener("click", resetView);
  playButton.addEventListener("click", togglePlayback);
  muteButton.addEventListener("click", () => { video.muted = !video.muted; });
  seek.addEventListener("pointerdown", () => { scrubbing = true; });
  window.addEventListener("pointerup", () => { scrubbing = false; });
  seek.addEventListener("input", () => {
    if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value);
    time.textContent = `${clock(Number(seek.value))} / ${clock(video.duration)}`;
  });
  for (const event of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "volumechange"]) video.addEventListener(event, updateControls);
  for (const event of ["loadeddata", "seeked", "play", "pause"]) video.addEventListener(event, mapVideoFrame);
  video.addEventListener("emptied", () => {
    material.map = posterTexture;
    material.needsUpdate = true;
    videoTexture?.dispose();
    videoTexture = null;
    updateControls();
    invalidate();
  });
  video.addEventListener("samplechange", () => {
    const previous = posterTexture;
    posterTexture = new THREE.TextureLoader().load(video.poster, invalidate);
    posterTexture.colorSpace = THREE.SRGBColorSpace;
    if (material.map === previous) material.map = posterTexture;
    material.needsUpdate = true;
    previous?.dispose();
  });

  fullscreenButton.hidden = !stage.requestFullscreen && !stage.webkitRequestFullscreen;
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else document.webkitExitFullscreen?.();
      } else if (stage.requestFullscreen) await stage.requestFullscreen();
      else stage.webkitRequestFullscreen?.();
    } catch {
      status.textContent = "Fullscreen is unavailable in this browser window.";
      status.hidden = false;
    }
  });
  for (const event of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(event, () => {
    fullscreenButton.setAttribute("aria-label", document.fullscreenElement || document.webkitFullscreenElement ? "Exit fullscreen" : "Enter fullscreen");
    resize();
  });

  const pointers = new Map();
  let drag, pinch;
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function startGesture() {
    if (pointers.size === 1) {
      const point = [...pointers.values()][0];
      drag = { ...point, yaw: view.yaw, pitch: view.pitch };
      pinch = null;
    } else if (pointers.size === 2) pinch = { distance: distance(), fov: view.fov };
    else { drag = null; pinch = null; }
  }
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.classList.add("is-dragging");
    startGesture();
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) setZoom(pinch.fov * pinch.distance / Math.max(distance(), 1));
    else if (pointers.size === 1 && drag) {
      view.yaw = drag.yaw + (drag.x - event.clientX) * 0.15;
      view.pitch = THREE.MathUtils.clamp(drag.pitch + (event.clientY - drag.y) * 0.15, -85, 85);
      invalidate();
    }
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, e => {
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.classList.toggle("is-dragging", pointers.size > 0);
    startGesture();
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    setZoom(view.fov + event.deltaY * 0.04);
  }, { passive: false });
  canvas.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0", " ", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") view.yaw -= 5;
    if (event.key === "ArrowRight") view.yaw += 5;
    if (event.key === "ArrowUp") view.pitch = Math.min(view.pitch + 5, 85);
    if (event.key === "ArrowDown") view.pitch = Math.max(view.pitch - 5, -85);
    if (event.key === "+" || event.key === "=") setZoom(view.fov - 8);
    if (event.key === "-") setZoom(view.fov + 8);
    if (event.key === "0" || event.key === "Home") resetView();
    if (event.key === " ") togglePlayback();
    invalidate();
  });

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) invalidate();
    else { cancelAnimationFrame(frameRequest); frameRequest = 0; }
  }).observe(stage);
  document.addEventListener("visibilitychange", invalidate);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    unavailable("360° playback was interrupted. Continue in the equirectangular view or reload the page.");
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    disposed = true;
    spatialAudio.dispose();
    cancelAnimationFrame(frameRequest);
    videoTexture?.dispose();
    posterTexture?.dispose();
    scene.children.forEach(mesh => mesh.geometry.dispose());
    material.dispose();
    renderer.dispose();
  });
  mapVideoFrame();
  updateControls();
  show360();
}

setup();
