/*
 * Four short sounds trimmed from a themed pack — a click-free fade-out
 * applied to each, then re-encoded from the original WAV extraction down
 * to a small MP3 (VBR ~100-130kbps; measured within 0.1dB of the WAV, so
 * the gains below didn't need re-tuning): audio/ui-blip.mp3 (0:08,
 * filter/chart-switch apply), audio/reset-blip.mp3 (0:10, the reset
 * button), audio/tick-blip.mp3 (0:13, sorting the "Numbers behind the
 * view" table), and audio/toggle-blip.mp3 (0:48, the sound-mute toggle
 * itself). They play on dashboard interactions (filter changes, chart
 * switches, reset, sort, row drill) — a separate layer from the
 * boot-intro's own audio. Each is decoded once via the Web Audio API and
 * replayed with a small per-interaction gain tweak so they land at
 * roughly the same perceived loudness despite differing source levels
 * (reset-blip.mp3 measures ~3.8dB louder than ui-blip.mp3 at the source,
 * tick-blip.mp3 ~1.8dB louder, and toggle-blip.mp3 ~8.7dB quieter, so
 * their gains are tuned accordingly — toggle-blip.mp3's is capped just
 * under its own clipping headroom rather than hitting the full target,
 * since its source has little peak headroom to boost into).
 *
 * The toggle sound is the one exception to "muted means silent": it has
 * to be audible on the click that turns sound OFF too, or a mute click
 * would give no confirmation at all — so it bypasses the mute gate that
 * every other sound here respects. Nothing here is ever autoplayed, only
 * started from a real user gesture, and the mute preference persists
 * across visits.
 */
(function () {
  const STORAGE_KEY = "vg-sound-muted";
  let muted = false;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "1";
  } catch (e) {
    /* private-browsing / storage blocked — default to unmuted, in-memory only */
  }

  let ctx = null;
  function ensureContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  }

  // Fetching/decoding doesn't need a user gesture, only playback does — so
  // each clip starts decoding immediately at load instead of on its first
  // play. Keyed by URL (not preset name) so two presets sharing a clip
  // would only fetch/decode it once; every call after the first just
  // reuses the already-resolved promise.
  const bufferPromises = new Map();
  function loadBuffer(url) {
    const c = ensureContext();
    if (!c) return Promise.resolve(null);
    if (!bufferPromises.has(url)) {
      bufferPromises.set(
        url,
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((data) => c.decodeAudioData(data))
          .catch(() => null)
      );
    }
    return bufferPromises.get(url);
  }

  const PRESETS = {
    apply: { url: "audio/ui-blip.mp3", rate: 1.0, gain: 0.9 },
    reset: { url: "audio/reset-blip.mp3", rate: 1.0, gain: 0.58 },
    tick: { url: "audio/tick-blip.mp3", rate: 1.0, gain: 0.73 },
  };
  const TOGGLE_PRESET = { url: "audio/toggle-blip.mp3", rate: 1.0, gain: 2.2 };
  Object.values(PRESETS).forEach((p) => loadBuffer(p.url));
  loadBuffer(TOGGLE_PRESET.url);

  function playPreset(preset) {
    const c = ensureContext();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    loadBuffer(preset.url).then((buffer) => {
      if (!buffer) return;
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = preset.rate;
      const g = c.createGain();
      g.gain.value = preset.gain;
      src.connect(g);
      g.connect(c.destination);
      src.start();
    });
  }

  function play(variant) {
    if (muted) return;
    playPreset(PRESETS[variant] || PRESETS.apply);
  }

  // The label always just reads "Sound" — the muted state is shown by
  // css/style.css striking the label through on [aria-pressed="false"].
  function syncToggleButtons() {
    document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(!muted));
    });
  }

  function setMuted(v) {
    muted = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch (e) {}
    syncToggleButtons();
    playPreset(TOGGLE_PRESET); // bypasses the mute gate — see file header
  }

  window.VGSound = { play, setMuted, isMuted: () => muted };

  document.addEventListener("DOMContentLoaded", () => {
    syncToggleButtons();
    document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => setMuted(!muted));
    });
  });
})();
