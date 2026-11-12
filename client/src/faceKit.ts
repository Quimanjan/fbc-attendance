// Camera + face-api helpers for face registration and the kiosk.
// Face data never leaves the browser except as 128 numbers sent to the server.
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';
const MIN_FACE_FRACTION = 0.12;   // face width as a share of the video width
// SSD MobileNet finds faces far more reliably (turned heads, glasses, dim rooms) than the tiny detector.
// The tiny detector, with a low threshold, is only a fallback for frames where SSD finds nothing.
const ssd = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35, maxResults: 3 });
const tiny = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });

// The camera image is copied to this canvas and brightened when the room is dark, so faces are easier to find.
const frame = document.createElement("canvas");
const probe = document.createElement("canvas");
let brightness = 128;   // average brightness of the last frame, 0-255

function measure(video: HTMLVideoElement) {
  probe.width = 32; probe.height = 24;
  const ctx = probe.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 32, 24);
  const px = ctx.getImageData(0, 0, 32, 24).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  brightness = sum / (px.length / 4);
}

/** The current camera frame, brightened in low light. */
function grab(video: HTMLVideoElement): HTMLCanvasElement {
  measure(video);
  frame.width = video.videoWidth; frame.height = video.videoHeight;
  const ctx = frame.getContext("2d")!;
  const gain = Math.min(2.2, Math.max(1, 120 / Math.max(brightness, 1)));
  ctx.filter = gain > 1.05 ? `brightness(${gain.toFixed(2)}) contrast(1.15)` : "none";
  ctx.drawImage(video, 0, 0);
  return frame;
}

async function detect(input: HTMLCanvasElement) {
  let dets = await faceapi.detectAllFaces(input, ssd).withFaceLandmarks();
  if (dets.length === 0) dets = await faceapi.detectAllFaces(input, tiny).withFaceLandmarks();
  return dets as Detection[];
}

/** What to tell the person when no face is found. */
export function noFaceHint(): string {
  if (brightness < 45) return "It's too dark. Face a window or turn on the lights.";
  if (brightness > 225) return "Too much light behind you. Move so the light is in front of you.";
  return "Look straight at the camera";
}

export type Detection = faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>;

let modelsLoaded: Promise<void> | null = null;

// Uses the graphics card when available, otherwise the slower WebAssembly backend.
async function initBackend() {
  const tf = faceapi.tf as any;
  tf.setWasmPaths?.("/wasm/");
  for (const name of ['webgl', 'wasm', 'cpu']) {
    try { if (await tf.setBackend(name)) break; } catch { /* try the next one */ }
  }
  await tf.ready();
}

export function loadModels() {
  modelsLoaded ??= initBackend().then(() => Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])).then(() => undefined);
  return modelsLoaded;
}

/** Starts the camera and calls onFrame for every processed frame until stop() is called. */
export async function startCamera(video: HTMLVideoElement, overlay: HTMLCanvasElement | null,
                                  onFrame: (dets: Detection[]) => Promise<void> | void) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot use the camera here. Open the site via http://localhost or HTTPS.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
  video.srcObject = stream;
  await new Promise<void>(r => (video.readyState >= 2 ? r() : (video.onloadeddata = () => r())));
  await loadModels();

  let stopped = false;
  const loop = async () => {
    if (stopped) return;
    try {
      const dets = await detect(grab(video));
      if (overlay) draw(overlay, video, dets);
      await onFrame(dets);
    } catch (e) { console.error(e); }
    setTimeout(loop, 60);
  };
  loop();
  return () => { stopped = true; stream.getTracks().forEach(t => t.stop()); };
}

function draw(canvas: HTMLCanvasElement, video: HTMLVideoElement, dets: Detection[]) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3; ctx.strokeStyle = '#4ade80';
  for (const d of dets) { const b = d.detection.box; ctx.strokeRect(b.x, b.y, b.width, b.height); }
}

/** Returns a hint if the face isn't good enough, or null if it is. */
export function quality(det: Detection, video: HTMLVideoElement): string | null {
  const b = det.detection.box;
  if (b.width < video.videoWidth * MIN_FACE_FRACTION) return 'Come a little closer';
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  if (cx < video.videoWidth * 0.12 || cx > video.videoWidth * 0.88 ||
      cy < video.videoHeight * 0.1 || cy > video.videoHeight * 0.9) return 'Move to the middle of the frame';
  return null;
}

/** Averages the face descriptor over `frames` frames; null if the face is lost or several appear. */
export async function averageDescriptor(video: HTMLVideoElement, frames: number): Promise<number[] | null> {
  const list: Float32Array[] = [];
  for (let i = 0; i < frames; i++) {
    const input = grab(video);
    let dets = await faceapi.detectAllFaces(input, ssd).withFaceLandmarks().withFaceDescriptors();
    if (dets.length === 0) dets = await faceapi.detectAllFaces(input, tiny).withFaceLandmarks().withFaceDescriptors();
    if (dets.length !== 1 || quality(dets[0] as unknown as Detection, video)) return null;
    list.push(dets[0].descriptor);
  }
  const avg = new Array<number>(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) avg[i] += d[i] / list.length;
  return avg.map(v => Math.round(v * 1e6) / 1e6);
}

/** Eye aspect ratio from the 68-point landmarks (points 36-41 and 42-47). */
export function eyeAspectRatio(points: { x: number; y: number }[]): number {
  const d = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const one = (i: number) => (d(i + 1, i + 5) + d(i + 2, i + 4)) / (2 * d(i, i + 3));
  return (one(36) + one(42)) / 2;
}

/** Liveness check: a printed photo can't blink. Detects eyes open -> closed -> open. */
export class BlinkDetector {
  private open = 0;
  private closed = false;
  private frames = 0;
  reset() { this.open = 0; this.closed = false; this.frames = 0; }
  update(points: { x: number; y: number }[]): boolean {
    const e = eyeAspectRatio(points);
    this.frames++;
    // Track the eyes-open baseline, rising quickly and decaying slowly.
    this.open = Math.max(e, this.open * 0.98);
    if (this.frames < 3) return false;
    if (!this.closed && e < this.open * 0.72) this.closed = true;
    else if (this.closed && e > this.open * 0.88) return true;
    return false;
  }
}

/**
 * Rough head pose from the 68-point landmarks.
 * yaw: nose offset from the middle of the eyes, in eye-distances (changes when turning left/right).
 * pitch: how far down the nose sits between the eyes and the mouth (changes when tilting up/down).
 */
export function headPose(points: { x: number; y: number }[]) {
  const avg = (from: number, to: number) => {
    let x = 0, y = 0;
    for (let i = from; i <= to; i++) { x += points[i].x; y += points[i].y; }
    const n = to - from + 1;
    return { x: x / n, y: y / n };
  };
  const leftEye = avg(36, 41), rightEye = avg(42, 47), mouth = avg(48, 59), nose = points[30];
  const eyes = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1;
  return {
    yaw: (nose.x - eyes.x) / eyeDist,
    pitch: (nose.y - eyes.y) / ((mouth.y - eyes.y) || 1),
  };
}
