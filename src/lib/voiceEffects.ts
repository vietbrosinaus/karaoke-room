/**
 * Voice effects for karaoke — pure Web Audio API, zero dependencies.
 * Each effect creates nodes that insert between mic source and destination.
 */

export type VoiceEffect = "none" | "hall" | "echo" | "warm" | "bright" | "chorus";

export interface EffectChain {
  input: AudioNode;   // connect mic source to this
  output: AudioNode;  // connect this to destination
  cleanup: () => void;
  // Effect-specific controls
  setWetDry?: (wet: number) => void; // 0 = dry, 1 = full effect
}

/**
 * No effect — passthrough.
 */
function createNone(ctx: AudioContext): EffectChain {
  const passthrough = ctx.createGain();
  passthrough.gain.value = 1;
  return { input: passthrough, output: passthrough, cleanup: () => { passthrough.disconnect(); } };
}

/**
 * Hall reverb — classic karaoke "singing in a concert hall" feel.
 */
function createHall(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const merger = ctx.createGain();

  dry.gain.value = 0.5;
  wet.gain.value = 0.5;

  // Feedback delay network — 4 delay lines with diffusion filters.
  // Dry signal passes through instantly (0ms latency).
  // Wet signal builds up naturally like a real room.
  const delays = [0.029, 0.037, 0.041, 0.053]; // prime-ish intervals for density
  const feedbackGain = 0.7; // controls decay time

  const delayNodes: DelayNode[] = [];
  const fbNodes: GainNode[] = [];
  const filterNodes: BiquadFilterNode[] = [];
  const wetMixer = ctx.createGain();
  wetMixer.gain.value = 0.3;

  for (const dt of delays) {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = dt;
    const fb = ctx.createGain();
    fb.gain.value = feedbackGain;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4000; // darken reflections like a real hall

    // input → delay → filter → feedback → delay (loop)
    //                       → wetMixer
    input.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d); // feedback loop
    lp.connect(wetMixer);

    delayNodes.push(d);
    fbNodes.push(fb);
    filterNodes.push(lp);
  }

  // Dry path: instant passthrough
  input.connect(dry);
  dry.connect(merger);
  wetMixer.connect(wet);
  wet.connect(merger);

  return {
    input,
    output: merger,
    cleanup: () => {
      input.disconnect();
      dry.disconnect();
      wet.disconnect();
      wetMixer.disconnect();
      merger.disconnect();
      delayNodes.forEach((d) => d.disconnect());
      fbNodes.forEach((f) => f.disconnect());
      filterNodes.forEach((f) => f.disconnect());
    },
    setWetDry: (w) => {
      wet.gain.value = w;
      dry.gain.value = 1 - w * 0.5;
    },
  };
}

/**
 * Echo/delay — rhythmic repeat effect.
 */
function createEcho(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const merger = ctx.createGain();
  const delay = ctx.createDelay(1.0);
  const feedback = ctx.createGain();

  dry.gain.value = 0.7;
  wet.gain.value = 0.35;
  delay.delayTime.value = 0.2; // 200ms delay — more audible
  feedback.gain.value = 0.35; // 50% feedback — more repeats

  // Dry path
  input.connect(dry);
  dry.connect(merger);

  // Wet path: input → delay → feedback loop → wet → merger
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay); // feedback loop
  delay.connect(wet);
  wet.connect(merger);

  return {
    input,
    output: merger,
    cleanup: () => {
      input.disconnect();
      dry.disconnect();
      wet.disconnect();
      delay.disconnect();
      feedback.disconnect();
      merger.disconnect();
    },
    setWetDry: (w) => {
      wet.gain.value = w * 0.8;
      dry.gain.value = 1 - w * 0.4;
    },
  };
}

/**
 * Warm — bass boost + slight compression for a rich, full sound.
 */
function createWarm(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();

  // Bass shelf boost
  const bassBoost = ctx.createBiquadFilter();
  bassBoost.type = "lowshelf";
  bassBoost.frequency.value = 300;
  bassBoost.gain.value = 6; // +6dB bass

  // Gentle high cut
  const highCut = ctx.createBiquadFilter();
  highCut.type = "highshelf";
  highCut.frequency.value = 6000;
  highCut.gain.value = -3; // -3dB highs

  // Light compression
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  input.connect(bassBoost);
  bassBoost.connect(highCut);
  highCut.connect(compressor);

  return {
    input,
    output: compressor,
    cleanup: () => {
      input.disconnect();
      bassBoost.disconnect();
      highCut.disconnect();
      compressor.disconnect();
    },
  };
}

/**
 * Bright — presence boost for clarity and cut-through.
 */
function createBright(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();

  // Presence boost
  const presenceBoost = ctx.createBiquadFilter();
  presenceBoost.type = "peaking";
  presenceBoost.frequency.value = 3000;
  presenceBoost.Q.value = 1.5;
  presenceBoost.gain.value = 5;

  // Air boost
  const airBoost = ctx.createBiquadFilter();
  airBoost.type = "highshelf";
  airBoost.frequency.value = 8000;
  airBoost.gain.value = 4;

  // Slight low cut (reduce muddiness)
  const lowCut = ctx.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = 120;

  input.connect(lowCut);
  lowCut.connect(presenceBoost);
  presenceBoost.connect(airBoost);

  return {
    input,
    output: airBoost,
    cleanup: () => {
      input.disconnect();
      lowCut.disconnect();
      presenceBoost.disconnect();
      airBoost.disconnect();
    },
  };
}

/**
 * Chorus — slight detuned doubling for a thicker vocal.
 */
function createChorus(ctx: AudioContext): EffectChain {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const merger = ctx.createGain();

  dry.gain.value = 0.7;

  // Two detuned delay lines
  const delay1 = ctx.createDelay(0.1);
  const delay2 = ctx.createDelay(0.1);
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();

  delay1.delayTime.value = 0.025; // 25ms
  delay2.delayTime.value = 0.035; // 35ms
  gain1.gain.value = 0.3;
  gain2.gain.value = 0.3;

  // Modulate delay times with LFOs for chorus shimmer
  const lfo1 = ctx.createOscillator();
  const lfo2 = ctx.createOscillator();
  const lfoGain1 = ctx.createGain();
  const lfoGain2 = ctx.createGain();

  lfo1.frequency.value = 0.5; // 0.5 Hz
  lfo2.frequency.value = 0.7;
  lfoGain1.gain.value = 0.005; // ±5ms modulation
  lfoGain2.gain.value = 0.007;

  lfo1.connect(lfoGain1);
  lfoGain1.connect(delay1.delayTime);
  lfo2.connect(lfoGain2);
  lfoGain2.connect(delay2.delayTime);
  lfo1.start();
  lfo2.start();

  input.connect(dry);
  dry.connect(merger);
  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(gain1);
  delay2.connect(gain2);
  gain1.connect(merger);
  gain2.connect(merger);

  return {
    input,
    output: merger,
    cleanup: () => {
      lfo1.stop();
      lfo2.stop();
      input.disconnect();
      dry.disconnect();
      delay1.disconnect();
      delay2.disconnect();
      gain1.disconnect();
      gain2.disconnect();
      lfo1.disconnect();
      lfo2.disconnect();
      lfoGain1.disconnect();
      lfoGain2.disconnect();
      merger.disconnect();
    },
  };
}

/**
 * Create an effect chain for the given effect type.
 */
export function createEffectChain(ctx: AudioContext, effect: VoiceEffect): EffectChain {
  switch (effect) {
    case "none": return createNone(ctx);
    case "hall": return createHall(ctx);
    case "echo": return createEcho(ctx);
    case "warm": return createWarm(ctx);
    case "bright": return createBright(ctx);
    case "chorus": return createChorus(ctx);
    default: return createNone(ctx);
  }
}

export const VOICE_EFFECTS: { id: VoiceEffect; label: string; description: string }[] = [
  { id: "none", label: "None", description: "Clean, no effects" },
  { id: "hall", label: "Hall", description: "Concert hall reverb" },
  { id: "echo", label: "Echo", description: "Rhythmic delay" },
  { id: "warm", label: "Warm", description: "Bass boost, rich tone" },
  { id: "bright", label: "Bright", description: "Crisp, clear presence" },
  { id: "chorus", label: "Chorus", description: "Thick, doubled vocal" },
];
