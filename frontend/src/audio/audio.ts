import { PermissionsAndroid, Platform } from 'react-native';
import {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  createSound,
  OutputFormatAndroidType,
} from 'react-native-nitro-sound';

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

/**
 * Starts recording AMR-WB (16 kHz, made for speech), a format Cloud
 * Speech-to-Text reads directly. Uses the speech-tuned mic.
 */
export async function startRecording(): Promise<void> {
  await stopPlaying();
  await recorder.startRecorder(undefined, {
    AudioSourceAndroid: AudioSourceAndroidType.VOICE_RECOGNITION,
    OutputFormatAndroid: OutputFormatAndroidType.AMR_WB,
    AudioEncoderAndroid: AudioEncoderAndroidType.AMR_WB,
    AudioSamplingRate: 16000,
    AudioChannels: 1,
    AudioEncodingBitRate: 23850,
  });
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
  // Under ~0.4 s of audio (AMR-WB is ~4 KB/s in base64): an accidental tap.
  if (base64.length < 1600) {
    return null;
  }
  return { base64, mimeType: 'audio/amr-wb' };
}
