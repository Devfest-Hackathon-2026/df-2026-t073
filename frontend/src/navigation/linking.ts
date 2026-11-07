import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Path for every screen, matching the route plan (/prepare/:placeId etc.).
 * Works as deep links once an intent filter for tankengo:// is added to
 * AndroidManifest.xml (not in this pass).
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['tankengo://'],
  config: {
    screens: {
      Welcome: 'welcome',
      Tabs: {
        screens: {
          Today: '',
          Plans: 'plans',
          Review: 'review',
          Me: 'me',
        },
      },
      Prepare: 'prepare/:placeId',
      Rehearse: 'rehearse/:placeId',
      RehearseResults: 'rehearse/:placeId/results',
      Capture: 'capture',
      CaptureToday: 'capture/today',
      TangoDetail: 'tango/:id',
      ReviewSession: 'review/session',
    },
  },
};
