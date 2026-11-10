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
import { LicensesSection } from './LicensesSection';
import { copy } from '../../copy';

const SECTIONS: Record<
  MeSectionId,
  { title: string; Body: () => React.JSX.Element }
> = {
  profile: { title: copy.meSections.profile, Body: ProfileSection },
  display: { title: copy.meSections.display, Body: DisplaySection },
  practice: { title: copy.meSections.practice, Body: PracticeSection },
  languages: { title: copy.meSections.languages, Body: LanguagesSection },
  privacy: { title: copy.meSections.privacy, Body: PrivacySection },
  licenses: { title: copy.meSections.licenses, Body: LicensesSection },
  developer: { title: copy.meSections.developer, Body: DeveloperSection },
};

/** One settings area from Me. */
export function MeSectionScreen({
  navigation,
  route,
}: RootScreenProps<'MeSection'>): React.JSX.Element {
  const { user } = useAuth();
  const section = route.params.section;

  if (
    section === 'developer' &&
    user?.email?.toLowerCase() !== 'test@tankengo.com'
  ) {
    return (
      <Screen>
        <ScreenHeader onBack={() => navigation.goBack()}>
          <SectionTitle en={copy.meSections.developer} />
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
