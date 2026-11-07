import {
  type NavigatorScreenParams,
  useNavigation,
} from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';

export type TabParamList = {
  Today: undefined;
  Plans: undefined;
  /** Placeholder route; the center tab button opens the Capture modal instead. */
  CaptureTab: undefined;
  Review: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Prepare: { placeId: string };
  Rehearse: { placeId: string };
  RehearseResults: { placeId: string; hintsUsed: number };
  Capture: undefined;
  CaptureToday: undefined;
  TangoDetail: { id: string };
  ReviewSession: { collectionId?: string } | undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

/** Root stack navigation from any screen, including tab screens. */
export function useRootNav(): RootNavigation {
  return useNavigation<RootNavigation>();
}

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
