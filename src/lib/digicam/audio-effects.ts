// Audio effects — simulates the cheap built-in microphone of an early
// 2000s digicam during video recording. Routes the mic stream through a
// Web Audio chain: bandpass (narrow response ~250-5500 Hz) + added white-
// noise hiss + soft waveshaper distortion + compressor (limited DR) →
// returns a processed MediaStream suitable for MediaRecorder.
//
// If Web Audio is unavailable or the input has no audio track, returns
// null (caller records video-only).

export interface CheapMicOptions {
  /** bandpass low frequency (Hz) — default 250 */
  lowFreq?: number;
  /** bandpass high frequency (Hz) — default 5500 */
  highFreq?: number;
  /** hiss noise level (0..1) — default 0.06 */
  hiss?: number;
  /** distortion amount (0..1) — default 0.12 */
  distortion?: number;
}

interface CheapMicGraph {
  stream: MediaStream;
  cleanup: () => void;
}

export function createCheapMicStream(
  input: MediaStream,
  opts: CheapMicOptions = {},
): CheapMicGraph | null {
  if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") {
    return null;
  }
  const audioTracks = input.getAudioTracks();
  if (audioTracks.length === 0) return null;

  const low = opts.lowFreq ?? 250;
  const high = opts.highFreq ?? 5500;
  const hiss = opts.hiss ?? 0.06;
  const dist = opts.distortion ?? 0.12;

  const AC = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext) as typeof AudioContext;
  const ctx = new AC();

  try {
    const source = ctx.createMediaStreamSource(input);

    // --- bandpass: cheap mic frequency response ---
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = (low + high) / 2;
    bandpass.Q.value = 0.6;
    bandpass.connect(source);

    // highpass + lowpass combination for a controlled band
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = low;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = high;

    // --- hiss generator (white noise) ---
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = hiss;
    noise.connect(noiseGain);

    // --- soft distortion (cheap mic clipping character) ---
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(dist);

    // --- compressor: limited dynamic range ---
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;

    // master gain
    const master = ctx.createGain();
    master.gain.value = 0.9;

    // chain: source -> bandpass -> hp -> lp -> shaper -> comp -> master
    // noise -> noiseGain -> master (mixed in)
    source.connect(hp);
    hp.connect(lp);
    lp.connect(shaper);
    shaper.connect(comp);
    comp.connect(master);
    noiseGain.connect(master);

    const dest = ctx.createMediaStreamDestination();
    // Force a single (mono) output channel — cheap camcorder mics were mono,
    // not the wide stereo of a modern phone mic.
    if (typeof dest.channelCount !== "undefined") {
      dest.channelCount = 1;
      dest.channelCountMode = "explicit";
      dest.channelInterpretation = "speakers";
    }
    master.connect(dest);

    noise.start();

    return {
      stream: dest.stream,
      cleanup: () => {
        try {
          noise.stop();
        } catch {
          /* noop */
        }
        try {
          master.disconnect();
          comp.disconnect();
          shaper.disconnect();
          lp.disconnect();
          hp.disconnect();
          noiseGain.disconnect();
          source.disconnect();
          ctx.close();
        } catch {
          /* noop */
        }
      },
    };
  } catch (e) {
    console.warn("cheap-mic setup failed", e);
    try {
      ctx.close();
    } catch {
      /* noop */
    }
    return null;
  }
}

function makeDistortionCurve(amount: number): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  const k = amount * 40 + 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // soft clip — tanh-like
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}
