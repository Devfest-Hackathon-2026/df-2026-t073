import { PermissionsAndroid, Platform } from 'react-native';
import { createSound } from 'react-native-nitro-sound';

// Separate instances so playing a staff line never interrupts a recording.
const player = createSound();
const recorder = createSound();

/** Asks for microphone permission. Resolves true if granted. */
export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Plays an audio URL (staff line). Stops whatever was playing first. */
export async function playUrl(url: string): Promise<void> {
  await player.stopPlayer().catch(() => {});
  await player.startPlayer(url);
}

export async function stopPlaying(): Promise<void> {
  await player.stopPlayer().catch(() => {});
}

/** Starts recording (AAC in an .mp4 file on Android). */
export async function startRecording(): Promise<void> {
  await stopPlaying();
  await recorder.startRecorder();
}

/** Recording as base64, or null if it failed or was too short to send. */
export async function stopRecording(): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  const path = await recorder.stopRecorder();
  if (!path || path.startsWith('recorder already')) {
    return null;
  }
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const blob = await (await fetch(uri)).blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // Under ~0.3 s of audio: treat as an accidental tap.
  if (base64.length < 4000) {
    return null;
  }
  return { base64, mimeType: 'audio/mp4' };
}
