import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  washiColors,
} from '../styles/tokens';
import type { MapPin } from '../types';
import { Hanamaru } from './Hanamaru';
import { TANGO_MAP_STYLE } from './mapStyle';
import { IconButton } from './ui';

const MARKER_SETTLE_MS = 600;
const FIT_MS = 300;
const CENTER = { x: 0.5, y: 0.5 };
// Labelled stamps stand just above their spot, so the blue "you are here" dot
// (drawn on top of markers) stays visible underneath.
const LABELLED_ANCHOR = { x: 0.5, y: 1 };
/** Breathing room around the outermost pins, in pixels. */
const FIT_EDGE = { top: 80, right: 80, bottom: 80, left: 80 };
/** Zoom used when there is a single pin (the neighborhood around it). */
const SINGLE_PIN_DELTA = 0.025;
/** Zoom around the user's own position: a few streets across. */
const FOCUS_DELTA = 0.005;
const COMPACT_EDGE = { top: 40, right: 40, bottom: 40, left: 40 };

/** Koenji to Nakano, with Asagaya at the west edge. */
const INITIAL_REGION: Region = {
  latitude: 35.7065,
  longitude: 139.6525,
  latitudeDelta: 0.022,
  longitudeDelta: 0.042,
};

/**
 * Google map of the user's Tango. Full-screen on Today; `compact` for small
 * static maps (Tango detail). Pins show the Tango count, or mastered stars
 * when `showStars` is on. Needs GOOGLE_MAPS_API_KEY in the root .env at
 * build time; without it the map renders blank.
 */
export function TangoMap({
  pins,
  showStars = false,
  interactive = true,
  onPinPress,
  bottomInset = 0,
  compact = false,
  onLocate,
  focus,
  showUser = false,
}: {
  pins: MapPin[];
  showStars?: boolean;
  interactive?: boolean;
  onPinPress?: (pin: MapPin) => void;
  /** Height covered by the bottom sheet, so centering and the Google logo stay visible. */
  bottomInset?: number;
  /** Small embedded map: no search-bar padding, tighter framing. */
  compact?: boolean;
  /** Shows a "my location" button; resolves the fresh position (null if unknown). */
  onLocate?: () => Promise<{ lat: number; lng: number } | null>;
  /** Start here (the user's position), zoomed in, instead of fitting all pins. */
  focus?: { lat: number; lng: number } | null;
  /** The phone's own blue location dot (needs location permission). */
  showUser?: boolean;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  // Keep the Tango area clear of the floating search bar (Today only).
  const topInset = compact ? 0 : insets.top + sizes.touch + space.lg;
  const edge = compact ? COMPACT_EDGE : FIT_EDGE;
  // Android draws custom markers as a snapshot; keep redrawing for a moment so
  // the badge is captured after layout, then stop to save work.
  const [tracking, setTracking] = useState(true);
  const mapRef = useRef<MapView>(null);
  const ready = useRef(false);

  // Frame all Tango pins in the visible area (between search bar and sheet).
  const tangoCoords = pins
    .filter(pin => pin.kind === 'tango')
    .map(pin => ({ latitude: pin.lat, longitude: pin.lng }));
  const coordsKey = JSON.stringify(tangoCoords);
  // Rounded so tiny GPS jitter doesn't re-center the map.
  const focusKey = focus
    ? `${focus.lat.toFixed(4)},${focus.lng.toFixed(4)}`
    : '';
  const fitPins = useCallback(
    (animated: boolean) => {
      const coords = JSON.parse(coordsKey) as {
        latitude: number;
        longitude: number;
      }[];
      if (!ready.current || !mapRef.current) {
        return;
      }
      if (focusKey) {
        const [latitude, longitude] = focusKey.split(',').map(Number);
        mapRef.current.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: FOCUS_DELTA,
            longitudeDelta: FOCUS_DELTA,
          },
          animated ? FIT_MS : 0,
        );
        return;
      }
      if (coords.length === 0) {
        mapRef.current.animateToRegion(INITIAL_REGION, animated ? FIT_MS : 0);
        return;
      }
      if (coords.length === 1) {
        mapRef.current.animateToRegion(
          {
            ...coords[0],
            latitudeDelta: SINGLE_PIN_DELTA,
            longitudeDelta: SINGLE_PIN_DELTA,
          },
          animated ? FIT_MS : 0,
        );
        return;
      }
      mapRef.current.fitToCoordinates(coords, { edgePadding: edge, animated });
    },
    [coordsKey, edge, focusKey],
  );

  // Re-frame when the sheet opens or closes (the visible area changes).
  useEffect(() => {
    fitPins(true);
  }, [fitPins, bottomInset]);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [showStars, pins.length]);

  const locate = async () => {
    const here = await onLocate?.();
    if (here && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: here.lat,
          longitude: here.lng,
          latitudeDelta: FOCUS_DELTA,
          longitudeDelta: FOCUS_DELTA,
        },
        FIT_MS,
      );
    }
  };

  return (
    <>
      <MapView
        ref={mapRef}
        style={[StyleSheet.absoluteFill, styles.paper]}
        // initialRegion is ignored if the map mounts before its size is known,
        // so pins are framed once the map is ready (fitPins).
        onMapReady={() => {
          ready.current = true;
          fitPins(false);
        }}
        provider={PROVIDER_GOOGLE}
        customMapStyle={TANGO_MAP_STYLE}
        showsUserLocation={showUser}
        showsMyLocationButton={false}
        // Paper instead of Google's grey while tiles load.
        loadingEnabled
        loadingBackgroundColor={washiColors.paper}
        loadingIndicatorColor={colors.accent}
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
            // Labelled pins: keep the badge (not the badge+label block) on the spot.
            anchor={
              pin.kind === 'tango' && pin.label ? LABELLED_ANCHOR : CENTER
            }
          >
            <PinBadge pin={pin} showStars={showStars} />
          </Marker>
        ))}
      </MapView>
      {onLocate && interactive ? (
        <View style={[styles.locate, { bottom: bottomInset + space.lg }]}>
          <IconButton
            icon="locate"
            label="Go to my location"
            onPress={locate}
          />
        </View>
      ) : null}
    </>
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
    // A filled tag: 次 = next.
    return (
      <View style={[styles.pin, styles.next]}>
        <Text style={styles.nextGlyph}>次</Text>
        <Text style={styles.text}>{pin.label}</Text>
      </View>
    );
  }
  // Tango: a stamp, like the seals and station stamps collected in Japan.
  // 単 is from 単語 (word); the hanamaru filter turns it into a red 花丸 stamp.
  return (
    <View style={styles.tangoWrap}>
      <View style={[styles.stamp, showStars && styles.stampStar]}>
        {showStars ? (
          <Hanamaru size={fontSizes.md} />
        ) : (
          <Text style={styles.stampGlyph}>単</Text>
        )}
        <Text style={[styles.stampCount, showStars && styles.stampTextStar]}>
          {showStars ? pin.stars ?? 0 : pin.count}
        </Text>
      </View>
      {pin.label ? (
        <View style={styles.areaTag}>
          <Text style={styles.areaLabel}>{pin.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: washiColors.paper,
  },
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
  tangoWrap: {
    alignItems: 'center',
  },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minWidth: sizes.pin + space.md,
    height: sizes.pin + space.md,
    paddingHorizontal: space.sm,
    borderRadius: radii.sm,
    borderWidth: sizes.border * 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  stampStar: {
    borderColor: colors.hanamaru,
  },
  stampGlyph: {
    ...base.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  stampCount: {
    ...base.text,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  stampTextStar: {
    color: colors.hanamaru,
  },
  areaTag: {
    marginTop: space.xxs,
    paddingHorizontal: space.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
  },
  areaLabel: {
    ...base.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  next: {
    flexDirection: 'row',
    gap: space.xs,
    backgroundColor: colors.accent,
  },
  nextGlyph: {
    ...base.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accentSoft,
  },
  locate: {
    position: 'absolute',
    right: space.lg,
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
