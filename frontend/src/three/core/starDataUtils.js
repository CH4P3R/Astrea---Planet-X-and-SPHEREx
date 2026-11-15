import { sampleWindow } from './imageDataUtils.js'
import { LocalizedError } from '../../i18n/messages.js'

export function prepareSkySnapshot(snapshot) {
  const { star_count: count, stars, directions, sample_times_ms: times, mode } = snapshot ?? {}
  if (snapshot?.coordinate_frame !== 'AltAz'
    || !Number.isSafeInteger(count) || count < 1 || !Array.isArray(stars) || stars.length !== count
    || !['live', 'paused'].includes(mode) || !Array.isArray(times) || !times.length
    || (mode === 'paused' ? times.length !== 1 : times.length < 2)
    || !times.every((time, i) => Number.isFinite(time) && (i === 0 || time > times[i - 1]))
    || !Array.isArray(directions) || directions.length !== times.length
    || !stars.every((star) => star && Number.isFinite(star.apparent_magnitude))) {
    throw new LocalizedError('errors.sky.metadata')
  }
  const samples = directions.map((sample) => {
    if (!Array.isArray(sample) || sample.length !== count * 3 || !sample.every(Number.isFinite)) {
      throw new LocalizedError('errors.sky.directions')
    }
    for (let i = 0; i < sample.length; i += 3) {
      const length = Math.hypot(sample[i], sample[i + 1], sample[i + 2])
      if (Math.abs(length - 1) > 0.001) throw new LocalizedError('errors.sky.direction')
    }
    return new Float32Array(sample)
  })
  return { ...snapshot, directions: samples }
}

export function skySnapshotIsCurrent(snapshot, timestamp) {
  return snapshot.mode === 'paused'
    || (timestamp >= snapshot.sample_times_ms[0] && timestamp <= snapshot.sample_times_ms.at(-1))
}

export function interpolateStarPositions(snapshot, timestamp, target, radius) {
  const [a, b, fraction] = sampleWindow(snapshot.sample_times_ms, timestamp)
  const first = snapshot.directions[a]
  const second = snapshot.directions[b]
  for (let offset = 0; offset < target.length; offset += 3) {
    const x = first[offset] + (second[offset] - first[offset]) * fraction
    const y = first[offset + 1] + (second[offset + 1] - first[offset + 1]) * fraction
    const z = first[offset + 2] + (second[offset + 2] - first[offset + 2]) * fraction
    const scale = radius / Math.hypot(x, y, z)
    target[offset] = x * scale
    target[offset + 1] = y * scale
    target[offset + 2] = z * scale
  }
}
