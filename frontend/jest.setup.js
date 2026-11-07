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
