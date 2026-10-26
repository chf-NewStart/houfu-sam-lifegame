/* Qi's stone synth on the audio thread: the app's StoneSound.Mixer, one sample at a time.
   Voices arrive from sound.js by message; each is a sine gliding between two pitches or
   low-passed noise, with a fast natural decay (to 2% by its end) and an optional swell. */
class QiSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.seed = 0x2545f491;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') { this.voices = []; return; }
      for (const v of e.data) this.voices.push({ ...v, phase: 0, time: 0, low: 0 });
    };
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const dt = 1 / sampleRate;
    const voices = this.voices;
    for (let f = 0; f < out.length; f++) {
      let mix = 0;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (v.time >= v.length) continue;
        if (v.wait > 0) { v.wait -= dt; continue; }
        const u = v.time / v.length;
        const gain = v.gain * Math.exp(-3.912 * u) * (v.time < v.attack ? v.time / v.attack : 1);
        const freq = v.from === v.to ? v.from : v.from * Math.pow(v.to / v.from, u);
        if (v.wave === 'sine') {
          mix += Math.sin(v.phase * 2 * Math.PI) * gain;
        } else {
          this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
          const white = (this.seed >>> 8) / 16777216 * 2 - 1;
          v.low += (1 - Math.exp(-2 * Math.PI * freq * dt)) * (white - v.low);
          mix += v.low * gain * 2.5;
        }
        v.phase = (v.phase + freq * dt) % 1;
        v.time += dt;
      }
      out[f] = Math.max(-1, Math.min(1, mix * 1.8));
    }
    if (voices.length > 64 || (voices.length && voices.every((v) => v.time >= v.length))) {
      this.voices = voices.filter((v) => v.time < v.length);
    }
    return true;
  }
}
registerProcessor('qi-synth', QiSynth);
