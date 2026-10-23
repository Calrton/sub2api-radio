import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 22050
const DURATION = 24
const CHANNELS = 2
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets')

const notes = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98,
  A2: 110,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99
}

let seed = 0x1a2b3c4d
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return ((seed >>> 0) / 0xffffffff) * 2 - 1
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function addTone(buffer, start, duration, frequency, amplitude, wave = 'sine', pan = 0, attack = 0.01, release = 0.1) {
  const startSample = Math.floor(start * SAMPLE_RATE)
  const endSample = Math.min(buffer.length / CHANNELS, Math.floor((start + duration) * SAMPLE_RATE))
  const panLeft = Math.cos(((pan + 1) * Math.PI) / 4)
  const panRight = Math.sin(((pan + 1) * Math.PI) / 4)

  for (let sample = startSample; sample < endSample; sample += 1) {
    const localTime = sample / SAMPLE_RATE - start
    const progress = localTime / duration
    const envelope =
      Math.min(1, localTime / Math.max(0.001, attack)) *
      Math.min(1, (duration - localTime) / Math.max(0.001, release))
    const phase = 2 * Math.PI * frequency * localTime
    let value
    if (wave === 'triangle') {
      value = (2 / Math.PI) * Math.asin(Math.sin(phase))
    } else if (wave === 'saw') {
      value = 2 * (localTime * frequency - Math.floor(0.5 + localTime * frequency))
    } else if (wave === 'square') {
      value = Math.sin(phase) >= 0 ? 1 : -1
    } else {
      value = Math.sin(phase)
    }
    const vibrato = 1 + 0.0025 * Math.sin(2 * Math.PI * 4.8 * localTime)
    value *= envelope * amplitude * vibrato
    buffer[sample * 2] += value * panLeft
    buffer[sample * 2 + 1] += value * panRight
  }
}

function addNoise(buffer, start, duration, amplitude, tone = 0.5, pan = 0) {
  const startSample = Math.floor(start * SAMPLE_RATE)
  const endSample = Math.min(buffer.length / CHANNELS, Math.floor((start + duration) * SAMPLE_RATE))
  let previous = 0
  const panLeft = Math.cos(((pan + 1) * Math.PI) / 4)
  const panRight = Math.sin(((pan + 1) * Math.PI) / 4)

  for (let sample = startSample; sample < endSample; sample += 1) {
    const localTime = sample / SAMPLE_RATE - start
    const progress = localTime / duration
    const envelope = Math.pow(1 - progress, 2)
    const raw = random()
    previous = previous * tone + raw * (1 - tone)
    const value = previous * envelope * amplitude
    buffer[sample * 2] += value * panLeft
    buffer[sample * 2 + 1] += value * panRight
  }
}

function addKick(buffer, start, amplitude = 0.3) {
  const duration = 0.5
  const startSample = Math.floor(start * SAMPLE_RATE)
  const endSample = Math.min(buffer.length / CHANNELS, Math.floor((start + duration) * SAMPLE_RATE))

  for (let sample = startSample; sample < endSample; sample += 1) {
    const t = sample / SAMPLE_RATE - start
    const env = Math.exp(-t * 13)
    const frequency = 46 + 92 * Math.exp(-t * 25)
    const value = Math.sin(2 * Math.PI * frequency * t) * env * amplitude
    buffer[sample * 2] += value
    buffer[sample * 2 + 1] += value
  }
}

function addSnare(buffer, start, amplitude = 0.18, pan = 0) {
  addNoise(buffer, start, 0.22, amplitude, 0.16, pan)
  addTone(buffer, start, 0.13, 180, amplitude * 0.45, 'triangle', pan, 0.002, 0.1)
}

function addHat(buffer, start, amplitude = 0.06, pan = 0) {
  addNoise(buffer, start, 0.07, amplitude, 0.05, pan)
}

function addImpact(buffer, start, amplitude = 0.32) {
  addKick(buffer, start, amplitude)
  addNoise(buffer, start, 0.7, amplitude * 0.38, 0.08)
  addTone(buffer, start, 1.8, notes.D2, amplitude * 0.16, 'sine', 0, 0.01, 1.4)
}

function chord(buffer, start, duration, frequencies, amplitude, wave, pan = 0) {
  frequencies.forEach((frequency, index) => {
    addTone(
      buffer,
      start,
      duration,
      frequency,
      amplitude / frequencies.length,
      wave,
      pan + (index - (frequencies.length - 1) / 2) * 0.12,
      0.08,
      Math.min(0.5, duration * 0.35)
    )
  })
}

function arp(buffer, start, step, pattern, amplitude, wave = 'triangle', pan = 0) {
  pattern.forEach((frequency, index) => {
    addTone(buffer, start + index * step, step * 0.72, frequency, amplitude, wave, pan, 0.005, step * 0.6)
  })
}

function buildSuspense() {
  const buffer = new Float32Array(SAMPLE_RATE * DURATION * CHANNELS)
  const beat = 60 / 68

  for (let bar = 0; bar < 4; bar += 1) {
    const start = bar * beat * 4
    chord(buffer, start, beat * 4, [notes.A2, notes.C3, notes.E3], 0.105, 'saw', -0.1)
    addTone(buffer, start, beat * 4, notes.A2, 0.075, 'sine', 0, 0.1, 0.8)
  }

  for (let time = 0; time < DURATION - 0.1; time += beat) {
    addKick(buffer, time, time % (beat * 4) < 0.01 ? 0.34 : 0.17)
    addHat(buffer, time + beat * 0.5, 0.035, 0.18)
    addHat(buffer, time + beat * 0.75, 0.022, -0.2)
  }

  for (let time = beat * 2; time < DURATION - 0.1; time += beat * 4) {
    addNoise(buffer, time, 1.1, 0.05, 0.22, -0.25)
  }

  for (let time = 8; time < 20; time += beat * 2) {
    addTone(buffer, time, beat * 1.7, notes.E4, 0.035, 'triangle', 0.26, 0.01, 0.5)
    addTone(buffer, time + beat, beat * 0.8, notes.C4, 0.026, 'triangle', -0.3, 0.01, 0.4)
  }

  for (let time = 16; time < 22; time += beat) {
    addNoise(buffer, time, beat * 0.9, 0.025 + (time - 16) * 0.003, 0.12, (time % (beat * 2) ? 0.25 : -0.25))
  }

  return buffer
}

function buildExplosive() {
  const buffer = new Float32Array(SAMPLE_RATE * DURATION * CHANNELS)
  const beat = 60 / 102

  const progression = [
    [notes.D3, notes.F3, notes.A3],
    [notes.B2, notes.D3, notes.F3],
    [notes.G2, notes.B2, notes.D3],
    [notes.A2, notes.C3, notes.E3]
  ]

  for (let bar = 0; bar < 8; bar += 1) {
    const start = bar * beat * 4
    const chordNotes = progression[bar % progression.length]
    chord(buffer, start, beat * 4, chordNotes, 0.105, 'saw', bar % 2 ? 0.16 : -0.16)
    addTone(buffer, start, beat * 4, chordNotes[0] / 2, 0.1, 'triangle', 0, 0.02, 0.4)
    addImpact(buffer, start, bar % 4 === 0 ? 0.4 : 0.22)

    for (let step = 0; step < 8; step += 1) {
      const time = start + step * beat * 0.5
      if (step % 2 === 0) addKick(buffer, time, 0.25)
      if (step === 2 || step === 6) addSnare(buffer, time, 0.21, step === 2 ? -0.08 : 0.08)
      addHat(buffer, time, step % 2 === 0 ? 0.045 : 0.03, step % 2 ? -0.18 : 0.18)
    }

    arp(buffer, start, beat * 0.5, [chordNotes[0] * 2, chordNotes[1] * 2, chordNotes[2] * 2, chordNotes[1] * 2], 0.035, 'square', 0.28)
  }

  addNoise(buffer, 18.5, 3.4, 0.13, 0.02)
  addImpact(buffer, 22.5, 0.5)
  return buffer
}

function buildSweet() {
  const buffer = new Float32Array(SAMPLE_RATE * DURATION * CHANNELS)
  const beat = 60 / 112
  const progression = [
    [notes.C4, notes.E4, notes.G4],
    [notes.G3, notes.B3, notes.D4],
    [notes.A3, notes.C4, notes.E4],
    [notes.F3, notes.A3, notes.C4]
  ]

  for (let bar = 0; bar < 14; bar += 1) {
    const start = bar * beat * 4
    const chordNotes = progression[bar % progression.length]
    chord(buffer, start, beat * 3.8, chordNotes, 0.045, 'sine', 0)

    const pattern = [
      chordNotes[0] * 2,
      chordNotes[1] * 2,
      chordNotes[2] * 2,
      chordNotes[1] * 2,
      chordNotes[0] * 4,
      chordNotes[1] * 2,
      chordNotes[2] * 2,
      chordNotes[1] * 2
    ]
    arp(buffer, start, beat * 0.5, pattern, 0.062, 'triangle', bar % 2 ? -0.22 : 0.22)

    for (let step = 0; step < 4; step += 1) {
      const time = start + step * beat
      addKick(buffer, time, 0.12)
      addHat(buffer, time + beat * 0.5, 0.026, -0.2)
    }
    addSnare(buffer, start + beat * 2, 0.09, 0.14)
    addSnare(buffer, start + beat * 3.5, 0.05, -0.14)
  }

  for (let bar = 2; bar < 12; bar += 2) {
    const start = bar * beat * 4 + beat * 2
    addTone(buffer, start, beat * 1.4, notes.E5, 0.025, 'sine', 0.3, 0.01, 0.4)
    addTone(buffer, start + beat * 0.5, beat * 1.4, notes.G5, 0.018, 'sine', 0.36, 0.01, 0.4)
  }

  return buffer
}

function buildUrban() {
  const buffer = new Float32Array(SAMPLE_RATE * DURATION * CHANNELS)
  const beat = 60 / 86

  for (let bar = 0; bar < 9; bar += 1) {
    const start = bar * beat * 4
    chord(buffer, start, beat * 4, [notes.D3, notes.F3, notes.A3], 0.07, 'saw', bar % 2 ? 0.2 : -0.2)
    addTone(buffer, start, beat * 4, notes.D2, 0.12, 'square', 0, 0.03, 0.7)

    for (let step = 0; step < 4; step += 1) {
      const time = start + step * beat
      addKick(buffer, time, step === 0 ? 0.33 : 0.2)
      addHat(buffer, time + beat * 0.25, 0.025, -0.3)
      addHat(buffer, time + beat * 0.75, 0.035, 0.3)
    }
    addSnare(buffer, start + beat * 2, 0.16, 0)
  }

  for (let time = 2; time < 22; time += beat * 2) {
    addTone(buffer, time, 0.11, notes.F4, 0.032, 'square', 0.3, 0.002, 0.08)
    addTone(buffer, time + beat, 0.08, notes.D4, 0.025, 'square', -0.32, 0.002, 0.06)
  }

  for (let time = 6; time < 18; time += beat * 4) {
    addNoise(buffer, time, 0.45, 0.05, 0.28, 0.1)
  }

  return buffer
}

function normalize(buffer, targetPeak = 0.82) {
  let peak = 0
  for (const value of buffer) peak = Math.max(peak, Math.abs(value))
  if (peak === 0) return
  const gain = targetPeak / peak
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = Math.tanh(buffer[index] * gain * 1.05)
  }
}

function writeWav(path, buffer) {
  const dataSize = buffer.length * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(CHANNELS, 22)
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28)
  wav.writeUInt16LE(CHANNELS * 2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)

  for (let index = 0; index < buffer.length; index += 1) {
    const sample = clamp(buffer[index], -1, 1)
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2)
  }
  writeFileSync(path, wav)
}

const builders = [['night-signal.wav', buildSuspense]]

mkdirSync(OUTPUT_DIR, { recursive: true })

for (const [filename, build] of builders) {
  seed = 0x1a2b3c4d
  const buffer = build()
  normalize(buffer)
  const outputPath = resolve(OUTPUT_DIR, filename)
  writeWav(outputPath, buffer)
  console.log(`Generated ${outputPath}`)
}
