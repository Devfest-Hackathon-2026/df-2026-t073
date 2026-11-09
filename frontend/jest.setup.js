/* eslint-env jest */

jest.setTimeout(20000);

// Native modules have no implementation under Jest, so they are replaced
// with small fakes here.

jest.mock(
  '@env',
  () => ({
    USE_MOCKS: 'true',
    API_BASE_URL: 'http://10.0.2.2:8000',
    LIVE_APIS: '',
    FIREBASE_API_KEY: 'test-api-key',
    FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    FIREBASE_PROJECT_ID: 'test-project',
    FIREBASE_APP_ID: 'test-app-id',
    TEST_USER_EMAIL: '',
    TEST_USER_PASSWORD: '',
  }),
  { virtual: true },
);

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: async key => (store.has(key) ? store.get(key) : null),
      setItem: async (key, value) => {
        store.set(key, value);
      },
      removeItem: async key => {
        store.delete(key);
      },
    },
  };
});

jest.mock('react-native-vision-camera', () => {
  const { View } = require('react-native');
  return {
    Camera: View,
    useCameraDevice: () => undefined,
    useCameraPermission: () => ({
      status: 'denied',
      hasPermission: false,
      canRequestPermission: false,
      requestPermission: async () => false,
    }),
    usePhotoOutput: () => ({
      capturePhotoToFile: async () => {
        throw new Error('No camera in tests');
      },
    }),
    useFrameOutput: () => ({}),
  };
});

jest.mock('react-native-vision-camera-mlkit', () => ({
  useTextRecognition: () => ({
    textRecognition: () => ({ text: '', blocks: [] }),
  }),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: async () => ({ didCancel: true }),
}));

jest.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));

jest.mock('firebase/auth', () => ({
  getReactNativePersistence: () => ({}),
  initializeAuth: () => ({
    authStateReady: async () => {},
    currentUser: null,
  }),
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => {};
  },
  signInAnonymously: async () => ({ user: null }),
  signInWithEmailAndPassword: async () => ({ user: { uid: 'test-user-uid', email: 'test@tankengo.com' } }),
  createUserWithEmailAndPassword: async () => ({ user: { uid: 'test-user-uid', email: 'test@tankengo.com' } }),
  signOut: async () => {},
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MapView = props => <View {...props} />;
  const Marker = props => <View {...props} />;
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_GOOGLE: 'google',
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: () => {},
    getCurrentPosition: (_ok, fail) =>
      fail({ code: 1, message: 'No location in tests' }),
  },
}));

jest.mock('react-native-nitro-sound', () => {
  const sound = () => ({
    startPlayer: async () => '',
    stopPlayer: async () => '',
    startRecorder: async () => '',
    stopRecorder: async () => '',
  });
  return {
    __esModule: true,
    createSound: sound,
    default: sound(),
    AudioSourceAndroidType: { VOICE_RECOGNITION: 6 },
    OutputFormatAndroidType: { AMR_WB: 4 },
    AudioEncoderAndroidType: { AMR_WB: 2 },
  };
});

// Icons draw with SVG, which has no native side under Jest.
jest.mock('lucide-react-native', () => {
  const Stub = () => null;
  return new Proxy(
    { __esModule: true },
    { get: (target, key) => (key in target ? target[key] : Stub) },
  );
});

jest.mock('react-native-svg', () => {
  const Stub = () => null;
  return {
    __esModule: true,
    default: Stub,
    Svg: Stub,
    Path: Stub,
    Circle: Stub,
  };
});
