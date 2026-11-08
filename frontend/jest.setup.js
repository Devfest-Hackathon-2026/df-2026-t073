/* eslint-env jest */

// Native modules have no implementation under Jest, so they are replaced
// with small fakes here.

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
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
  };
});

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
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MapView = props => <View {...props} />;
  const Marker = props => <View {...props} />;
  return { __esModule: true, default: MapView, Marker, PROVIDER_GOOGLE: 'google' };
});

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: () => {},
    getCurrentPosition: (_ok, fail) => fail({ code: 1, message: 'No location in tests' }),
  },
}));

jest.mock('react-native-nitro-sound', () => {
  const sound = () => ({
    startPlayer: async () => '',
    stopPlayer: async () => '',
    startRecorder: async () => '',
    stopRecorder: async () => '',
  });
  return { __esModule: true, createSound: sound, default: sound() };
});
