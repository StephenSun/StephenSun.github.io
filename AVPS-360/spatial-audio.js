// FOA stays in ACN order (W, Y, Z, X). STARSS23 uses SN3D; the
// JSAmbisonics decoder and its bundled Aalto filters expect N3D.
const FILTER_URL = new URL("./vendor/jsambisonics/aalto2016_N1.wav", import.meta.url);

export function createFoaGraph(context, filters) {
  const library = globalThis.ambisonics;
  const converter = new library.converters.sn3d2n3d(context, 1);
  const rotator = new library.sceneRotator(context, 1);
  const decoder = new library.binDecoder(context, 1);
  decoder.updateFilters(filters);
  converter.out.connect(rotator.in);
  rotator.out.connect(decoder.in);
  return { input: converter.in, output: decoder.out, rotator };
}

export function orientFoa(rotator, yaw, pitch) {
  // The panorama centre (u=0.5, Three.js yaw=180) is FOA azimuth 0.
  // Increasing u turns right, while FOA azimuth increases to the left.
  // JSAmbisonics applies the inverse yaw; its pitch sign is opposite to
  // the viewer's upward-positive elevation. Roll remains zero.
  rotator.yaw = 180 - yaw;
  rotator.pitch = -pitch;
  rotator.roll = 0;
  rotator.updateRotMtx();
}

export class SpatialAudio {
  constructor(video, note) {
    this.video = video;
    this.note = note;
    this.mode = "flat";
    this.yaw = 180;
    this.pitch = 0;
    this.ready = false;
    this.failed = false;
    this.waiting = false;
    this.disposed = false;
    this.listeners = [];
    this.foaUrl = new URL(video.dataset.foaSrc, import.meta.url).href;
    this.loadVersion = 0;
    this.listen("samplechange", () => this.setSource(this.video.dataset.foaSrc));
    this.listen("play", () => { this.waiting = false; void this.activate(); });
    this.listen("playing", () => { this.waiting = false; this.sync(); });
    for (const event of ["pause", "ended", "seeking", "emptied", "error"]) {
      this.listen(event, () => this.stop());
    }
    this.listen("waiting", () => { this.waiting = true; this.stop(); });
    this.listen("seeked", () => { this.waiting = false; this.sync(); });
    this.listen("ratechange", () => this.sync());
    this.listen("volumechange", () => this.updateRouting());
    this.refreshNote();
  }

  listen(event, callback) {
    this.video.addEventListener(event, callback);
    this.listeners.push([event, callback]);
  }

  setSource(url) {
    const next = new URL(url, import.meta.url).href;
    if (next === this.foaUrl) return;
    this.foaUrl = next;
    ++this.loadVersion;
    this.stop();
    this.ready = false;
    this.failed = false;
    this.waiting = false;
    this.buffer = null;
    this.loading = null;
    this.updateRouting();
    if (this.context) void this.activate();
  }

  setView(mode, yaw, pitch) {
    const changedMode = mode !== this.mode;
    const changedDirection = yaw !== this.yaw || pitch !== this.pitch;
    this.mode = mode;
    this.yaw = yaw;
    this.pitch = pitch;
    if (this.graph && (changedDirection || changedMode)) {
      orientFoa(this.graph.rotator, yaw, pitch);
    }
    if (changedMode) {
      this.updateRouting();
      this.sync();
      if (mode === "360" && !this.video.paused) void this.activate();
    }
    this.refreshNote();
  }

  // Call synchronously from playback/view controls to satisfy browser audio
  // activation rules. Fetching/decoding proceeds while W-channel audio plays.
  activate() {
    if (this.disposed || (this.mode !== "360" && !this.context)) return Promise.resolve();
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContextClass({ latencyHint: "interactive" });
        this.dry = this.context.createGain();
        this.dry.gain.value = 1;
        this.media = this.context.createMediaElementSource(this.video);
        this.media.connect(this.dry);
        this.dry.connect(this.context.destination);
        this.context.addEventListener("statechange", () => {
          if (this.disposed) return;
          this.updateRouting();
          this.sync();
        });
      }
      if (this.context.state !== "running") {
        void this.context.resume().then(() => {
          if (!this.disposed) {
            this.updateRouting();
            if (!this.source) this.sync();
          }
        }).catch(() => this.refreshNote());
      } else if (this.ready && !this.source) this.sync();
      if (!this.loading && !this.failed) {
        const version = this.loadVersion;
        this.loading = this.load(version).catch(error => {
          if (this.disposed || version !== this.loadVersion) return;
          console.warn("Spatial audio unavailable; using W-channel preview.", error);
          this.failed = true;
          this.ready = false;
          this.stop();
          this.updateRouting();
        });
      }
      return this.loading || Promise.resolve();
    } catch (error) {
      this.failed = true;
      this.refreshNote();
      return Promise.resolve();
    }
  }

  async load(version) {
    this.refreshNote();
    const decode = async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      return this.context.decodeAudioData(await response.arrayBuffer());
    };
    const [, buffer, filters] = await Promise.all([
      import("./vendor/jsambisonics/ambisonics.umd.js"),
      decode(this.foaUrl), this.graph ? null : decode(FILTER_URL),
    ]);
    if (this.disposed || version !== this.loadVersion) return;
    if (buffer.numberOfChannels !== 4 || (filters && filters.numberOfChannels !== 4)) {
      throw new Error("FOA audio and decoding filters must each contain four channels.");
    }
    this.buffer = buffer;
    if (!this.graph) {
      this.graph = createFoaGraph(this.context, filters);
      this.wet = this.context.createGain();
      this.wet.gain.value = 0;
      this.graph.output.connect(this.wet);
      this.wet.connect(this.context.destination);
    }
    orientFoa(this.graph.rotator, this.yaw, this.pitch);
    this.ready = true;
    this.updateRouting();
    this.sync();
  }

  isSpatial() {
    return this.mode === "360" && this.ready && this.context?.state === "running";
  }

  updateRouting() {
    const spatial = this.isSpatial();
    if (this.dry) this.dry.gain.value = spatial ? 0 : 1;
    // MediaElementSource preserves native mute/volume for W playback. The
    // independent FOA buffer follows the same controls explicitly.
    if (this.wet) this.wet.gain.value = spatial && this.source && !this.video.muted
      ? this.video.volume : 0;
    this.refreshNote();
  }

  refreshNote() {
    let message;
    if (this.mode !== "360") {
      message = "Audio preview: omnidirectional W channel.";
    } else if (this.failed) {
      message = "Spatial audio is unavailable. Playing the omnidirectional W-channel preview.";
    } else if (this.ready && this.context.state !== "running") {
      message = "Spatial audio is paused by the browser. Press Play or interact with the player to enable it.";
    } else if (this.ready) {
      message = "Spatial audio: binaural FOA. Wear headphones; sound follows your viewing direction.";
    } else if (this.context) {
      message = "Loading spatial audio. The W-channel preview remains available.";
    } else {
      message = "Spatial audio: wear headphones. Press Play to hear sound follow your viewing direction.";
    }
    if (this.note.textContent !== message) this.note.textContent = message;
  }

  sync() {
    this.stop();
    const video = this.video;
    if (this.disposed || !this.isSpatial() || video.paused || video.ended ||
        video.seeking || this.waiting || video.readyState < 2) return;
    const offset = Math.max(0, video.currentTime);
    if (offset >= this.buffer.duration) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.channelInterpretation = "discrete";
    source.playbackRate.value = video.playbackRate;
    source.connect(this.graph.input);
    this.source = source;
    this.anchorMedia = offset;
    this.anchorContext = this.context.currentTime;
    source.onended = () => {
      if (this.source === source) this.stop();
    };
    source.start(this.anchorContext, offset);
    this.updateRouting();
    // The video clock is authoritative, including buffering and seeking.
    // Correct meaningful drift without restarting audio on every video frame.
    this.timer = window.setInterval(() => {
      if (!this.source) return;
      const expected = this.anchorMedia +
        (this.context.currentTime - this.anchorContext) * video.playbackRate;
      if (Math.abs(expected - video.currentTime) > 0.08) this.sync();
    }, 200);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = null;
    if (this.source) {
      const source = this.source;
      this.source = null;
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    if (this.wet) this.wet.gain.value = 0;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    for (const [event, callback] of this.listeners) this.video.removeEventListener(event, callback);
    if (this.context) void this.context.close();
  }
}
