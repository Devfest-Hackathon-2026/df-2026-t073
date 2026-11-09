import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Jp } from '../src/components/Jp';
import { SettingsProvider, useSettings } from '../src/state/SettingsContext';

function FuriganaOn({ children }: { children: React.ReactNode }) {
  const { settings, update } = useSettings();
  React.useEffect(() => {
    update({ showJapaneseAs: 'kanji', furigana: true });
  }, [update]);
  return settings.furigana ? <>{children}</> : null;
}

async function texts(node: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <FuriganaOn>{node}</FuriganaOn>
      </SettingsProvider>,
    );
  });
  const all = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''));
  await ReactTestRenderer.act(async () => tree.unmount());
  return all;
}

test('furigana shows over kanji', async () => {
  expect(await texts(<Jp text="食券" reading="しょっけん" />)).toEqual([
    'しょっけん',
    '食券',
  ]);
});

test('no furigana over kana-only text', async () => {
  expect(await texts(<Jp text="ラーメン" reading="らーめん" />)).toEqual([
    'ラーメン',
  ]);
});

test('furigana={false} turns furigana off, e.g. for place names', async () => {
  expect(
    await texts(
      <Jp text="麺屋たいき" reading="めんやたいき" furigana={false} />,
    ),
  ).toEqual(['麺屋たいき']);
});

test('without keepFuriganaLine, kana words have no empty line (pills center them)', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <FuriganaOn>
          <Jp text="かため" keepFuriganaLine={false} />
        </FuriganaOn>
      </SettingsProvider>,
    );
  });
  // Only the word's own Text and its column View: no furigana line.
  expect(tree.root.findAllByType(View)).toHaveLength(1);
  await ReactTestRenderer.act(async () => tree.unmount());
});

describe('alignReading puts each reading over its own kanji', () => {
  const { alignReading, groupUnits } = require('../src/components/furigana');
  const rubies = (text: string, reading: string) =>
    alignReading(text, reading)
      ?.filter((u: { ruby?: string }) => u.ruby)
      .map((u: { base: string; ruby: string }) => `${u.base}:${u.ruby}`);

  test('kanji between kana', () => {
    expect(rubies('何かお探しですか？', 'なにかおさがしですか？')).toEqual([
      '何:なに',
      '探:さが',
    ]);
  });

  test('katakana in the text matches hiragana in the reading', () => {
    expect(
      rubies(
        'こちらの早稲田ベアのクリアファイルが人気ですが、いかがですか？',
        'こちらのわせだべあのくりあふぁいるがにんきですが、いかがですか?',
      ),
    ).toEqual(['早稲田:わせだ', '人気:にんき']);
  });

  test('digits never get furigana; kanji next to them still do', () => {
    const units = alignReading(
      '硬度53mg/L軟水',
      'こうどごじゅうさんみりぐらむぱーりっとるなんすい',
    );
    expect(units.map((u: { base: string }) => u.base)).toEqual([
      '硬度',
      '53',
      'mg/L',
      '軟水',
    ]);
    expect(units[0].ruby).toBe('こうど');
    expect(units[1].ruby).toBeUndefined();
    expect(units[2].ruby).toBeUndefined();
    expect(units[3].ruby).toBe('なんすい');
    expect(rubies('3本', 'さんぼん')).toEqual(['本:ぼん']);
    expect(rubies('1本', 'いっぽん')).toEqual(['本:ぽん']);
    expect(rubies('五十三人', 'ごじゅうさんにん')).toEqual([
      '五十三人:ごじゅうさんにん',
    ]);
  });

  test('letters read aloud pin down the kanji next to them', () => {
    expect(rubies('ABC駅', 'えーびーしーえき')).toEqual(['駅:えき']);
  });

  test('when the split next to a symbol is unclear, no furigana is shown', () => {
    expect(rubies('★駅', 'ほしえき')).toEqual([]);
  });

  test('kanji between kana in a sentence', () => {
    expect(
      rubies(
        'リサイクルにご協力ください。',
        'りさいくるにごきょうりょくください。',
      ),
    ).toEqual(['協力:きょうりょく']);
  });

  test('a reading that does not line up gives null', () => {
    expect(alignReading('食券', '')).toBeNull();
    expect(alignReading('食べる', 'たべます')).toBeNull();
  });

  test('lines never start with 。 or small kana', () => {
    const groups = groupUnits(alignReading('ちょっと。', 'ちょっと。')!);
    expect(
      groups.map((g: { base: string }[]) => g.map(u => u.base).join('')),
    ).toEqual(['ちょっ', 'と。']);
  });
});

test('long sentences get furigana per kanji, not one long line', async () => {
  const all = await texts(
    <Jp text="何かお探しですか" reading="なにかおさがしですか" />,
  );
  expect(all).toContain('なに');
  expect(all).toContain('さが');
  expect(all).not.toContain('なにかおさがしですか');
});

test('alwaysFurigana shows furigana even with the setting off', async () => {
  function FuriganaOff({ children }: { children: React.ReactNode }) {
    const { settings, ready, update } = useSettings();
    // After saved settings load, so they don't overwrite this.
    React.useEffect(() => {
      if (ready) {
        update({ showJapaneseAs: 'kanji', furigana: false });
      }
    }, [ready, update]);
    return ready && !settings.furigana ? <>{children}</> : null;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SettingsProvider>
        <FuriganaOff>
          <Jp text="運転" reading="うんてん" />
          <Jp text="食券" reading="しょっけん" alwaysFurigana />
        </FuriganaOff>
      </SettingsProvider>,
    );
  });
  const all = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat().join(''));
  expect(all).not.toContain('うんてん');
  expect(all).toContain('しょっけん');
  await ReactTestRenderer.act(async () => tree.unmount());
});
