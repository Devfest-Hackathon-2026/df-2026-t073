import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { base } from '../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../styles/tokens';
import type { MapPin } from '../types';
import { TANGO_MAP_STYLE } from './mapStyle';

const MARKER_SETTLE_MS = 600;

/** Koenji to Nakano, with Asagaya at the west edge. */
const INITIAL_REGION: Region = {
  latitude: 35.7065,
  longitude: 139.6525,
  latitudeDelta: 0.022,
  longitudeDelta: 0.042,
};

/**
 * Google map of the user's Tango (Today screen). Pins show the Tango count,
 * or mastered stars when `showStars` is on. Needs GOOGLE_MAPS_API_KEY in the
 * root .env at build time; without it the map renders blank.
 */
export function TangoMap({
  pins,
  showStars = false,
  interactive = true,
  onPinPress,
  bottomInset = 0,
}: {
  pins: MapPin[];
  showStars?: boolean;
  interactive?: boolean;
  onPinPress?: (pin: MapPin) => void;
  /** Height covered by the bottom sheet, so centering and the Google logo stay visible. */
  bottomInset?: number;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  // Keep the Tango area clear of the floating search bar.
  const topInset = insets.top + sizes.touch + space.lg;
  // Android draws custom markers as a snapshot; keep redrawing for a moment so
  // the badge is captured after layout, then stop to save work.
  const [tracking, setTracking] = useState(true);
  const mapRef = useRef<MapView>(null);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [showStars, pins.length]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      // initialRegion is ignored if the map mounts before its size is known,
      // so move to the Tango area once the map is ready.
      onMapReady={() => mapRef.current?.animateToRegion(INITIAL_REGION, 0)}
      provider={PROVIDER_GOOGLE}
      customMapStyle={TANGO_MAP_STYLE}
      mapPadding={{ top: topInset, right: 0, bottom: bottomInset, left: 0 }}
      showsBuildings={false}
      showsIndoors={false}
      showsTraffic={false}
      initialRegion={INITIAL_REGION}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      showsPointsOfInterests={false}
      accessibilityLabel="Map of your Tango"
    >
      {pins.map(pin => (
        <Marker
          key={pin.id}
          coordinate={{ latitude: pin.lat, longitude: pin.lng }}
          onPress={onPinPress ? () => onPinPress(pin) : undefined}
          tracksViewChanges={tracking}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <PinBadge pin={pin} showStars={showStars} />
        </Marker>
      ))}
    </MapView>
  );
}

function PinBadge({
  pin,
  showStars,
}: {
  pin: MapPin;
  showStars: boolean;
}): React.JSX.Element {
  if (pin.kind === 'me') {
    return <View style={[styles.pin, styles.me]} />;
  }
  if (pin.kind === 'next') {
    return (
      <View style={[styles.pin, styles.next]}>
        <Text style={styles.text}>{pin.label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pin, styles.tango]}>
      <Text style={styles.text}>
        {showStars ? `★${pin.stars ?? 0}` : pin.count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    minWidth: sizes.pin + space.sm,
    height: sizes.pin + space.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: sizes.border,
    borderColor: colors.surface,
  },
  tango: {
    backgroundColor: colors.dark,
  },
  next: {
    backgroundColor: colors.accent,
  },
  me: {
    minWidth: sizes.pin,
    width: sizes.pin,
    height: sizes.pin,
    paddingHorizontal: 0,
    backgroundColor: colors.accent,
    borderWidth: sizes.border * 2,
    borderColor: colors.accentSoft,
  },
  text: {
    ...base.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textInverse,
  },
});
