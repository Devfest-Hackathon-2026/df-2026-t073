import React from 'react';
import { Screen, ScreenHeader } from '../../components/layout';
import { SectionTitle } from '../../components/ui';
import type { MeSectionId, RootScreenProps } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
import {
  DeveloperSection,
  DisplaySection,
  LanguagesSection,
  PracticeSection,
  PrivacySection,
  ProfileSection,
} from './MeSections';

const SECTIONS: Record<
  MeSectionId,
  { title: string; Body: () => React.JSX.Element }
> = {
  profile: { title: 'Profile', Body: ProfileSection },
  display: { title: 'Japanese display', Body: DisplaySection },
  practice: { title: 'Practice', Body: PracticeSection },
  languages: { title: 'Languages', Body: LanguagesSection },
  privacy: { title: 'Privacy & location', Body: PrivacySection },
  developer: { title: 'Developer', Body: DeveloperSection },
};

/** One settings area from Me. */
export function MeSectionScreen({
  navigation,
  route,
}: RootScreenProps<'MeSection'>): React.JSX.Element {
  const { user } = useAuth();
  const section = route.params.section;

  if (section === 'developer' && user?.email?.toLowerCase() !== 'test@tankengo.com') {
    return (
      <Screen>
        <ScreenHeader onBack={() => navigation.goBack()}>
          <SectionTitle en="Developer" />
        </ScreenHeader>
      </Screen>
    );
  }

  const { title, Body } = SECTIONS[section];
  return (
    <Screen>
      <ScreenHeader onBack={() => navigation.goBack()}>
        <SectionTitle en={title} />
      </ScreenHeader>
      <Body />
    </Screen>
  );
}
