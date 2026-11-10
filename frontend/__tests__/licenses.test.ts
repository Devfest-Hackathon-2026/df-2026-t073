import { LICENSE_TEXTS, LICENSES } from '../src/legal/licenses.generated';

const names = LICENSES.map(l => l.name);

test('lists the bundled font and artwork first', () => {
  expect(names[0]).toMatch(/Murecho/);
  expect(names[1]).toMatch(/Noto Emoji/);
});

test('lists the packages the app ships', () => {
  expect(names).toEqual(
    expect.arrayContaining(['react', 'react-native', 'firebase']),
  );
});

test('every entry has its full license text', () => {
  for (const entry of LICENSES) {
    const text = LICENSE_TEXTS[entry.text];
    expect(text?.length).toBeGreaterThan(100);
    expect(text).not.toMatch(/No license file was included/);
  }
});
