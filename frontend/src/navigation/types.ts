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
  /** Full Tango map; areaId opens that neighborhood's card. */
  Map: { areaId?: string } | undefined;
  /** Placeholder route; the center tab button opens the Capture modal instead. */
  CaptureTab: undefined;
  Review: undefined;
  Me: undefined;
  /** Takes the Map tab's place when the map is off. */
  PlansTab: undefined;
};

export type MeSectionId =
  | 'profile'
  | 'display'
  | 'practice'
  | 'languages'
  | 'privacy'
  | 'licenses'
  | 'developer';

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Prepare: { placeId: string };
  Rehearse: { placeId: string };
  RehearseResults: {
    placeId: string;
    hintsUsed: number;
    rehearsalId: string | null;
  };
  Capture: undefined;
  CaptureToday: undefined;
  TangoDetail: { id: string };
  ReviewSession: { collectionId?: string } | undefined;
  /** Upcoming visits (opened from Today). */
  Plans: undefined;
  /** Every Tango, searchable (opened from Review). */
  /** A user-made review list. */
  TangoList: { listId: string };
  /** One settings area from Me. */
  MeSection: { section: MeSectionId };
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
