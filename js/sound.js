/*
 * Quiet synthesized UI blips for dashboard interactions (filter changes,
 * chart switches, reset, sort, row drill) — a separate, muteable layer from
 * the boot-intro's own audio. Tones are generated with the Web Audio API
 * (no audio file needed), only ever started from a real user gesture (never
 * autoplayed), and the mute preference persists across visits.
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
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function blip({ freqFrom, freqTo, duration, gain }) {
    if (muted) return;
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqFrom, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqTo, c.currentTime + duration);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration + 0.02);
  }

  const PRESETS = {
    apply: { freqFrom: 720, freqTo: 480, duration: 0.09, gain: 0.045 },
    reset: { freqFrom: 420, freqTo: 260, duration: 0.14, gain: 0.045 },
    tick: { freqFrom: 900, freqTo: 820, duration: 0.045, gain: 0.03 },
  };

  function play(variant) {
    blip(PRESETS[variant] || PRESETS.apply);
  }

  // The label always just reads "Sound" — the muted state is shown by
  // css/style.css striking the label through on [aria-pressed="false"].
  function syncToggleButtons() {
    document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(!muted));
    });
  }

  function setMuted(v) {
    const wasMuted = muted;
    muted = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch (e) {}
    syncToggleButtons();
    if (wasMuted && !muted) play("tick"); // confirm turning it back on
  }

  window.VGSound = { play, setMuted, isMuted: () => muted };

  document.addEventListener("DOMContentLoaded", () => {
    syncToggleButtons();
    document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => setMuted(!muted));
    });
  });
})();
