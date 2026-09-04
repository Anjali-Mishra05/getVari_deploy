import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';

interface CustomSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
}

/** Diameter of the draggable knob. */
const THUMB_SIZE = 20;

/**
 * The touch-anywhere slider used for age and weight.
 *
 * Deliberately not a native slider: the app never ships a value the user did
 * not aim at, and a plain responder over a track is enough for two integer
 * fields. Shared by onboarding and the profile editor so the two screens
 * cannot drift apart.
 *
 * ## Two things used to make it unreachable at the ends
 *
 * 1. **The width was guessed.** It assumed `Dimensions.get('window').width - 120`,
 *    but the track is laid out inside a card with its own padding, so the
 *    number it divided by was never the number of pixels on screen. Every
 *    touch mapped to a value a little way off, and the error was worst at the
 *    extremes — which is why the low end could not be reached. The track now
 *    measures itself with `onLayout` and uses that.
 *
 * 2. **The knob stole the touch.** `locationX` is relative to the view the
 *    touch landed on, and the knob sits on top of the track. Dragging near the
 *    low end put the knob under the finger, so the reported x-offset was
 *    0-20px *within the knob* rather than a position along the track, and the
 *    value stuck. The knob and the fill are now `pointerEvents="none"`, so the
 *    track is always the view being measured against.
 */
const CustomSlider = ({ min, max, value, onChange, label, unit = '' }: CustomSliderProps) => {
  // Zero until the first layout pass. Guarded everywhere below rather than
  // seeded with a guess, so a pre-measurement touch is ignored instead of
  // being mapped through the wrong width.
  const [trackWidth, setTrackWidth] = useState(0);

  // The knob is `min` at x=0 and `max` at x=trackWidth. Its centre travels the
  // full width, so the usable span is the width itself.
  const span = Math.max(1, max - min);
  const ratio = trackWidth > 0 ? (value - min) / span : 0;
  const position = Math.max(0, Math.min(1, ratio)) * trackWidth;

  // Avoids calling back with the value the parent already holds, which would
  // re-render the whole onboarding step on every pixel of a drag.
  const lastEmitted = useRef(value);

  const handleTouch = (event: { nativeEvent: { locationX: number } }) => {
    if (trackWidth <= 0) return;

    const touchX = event.nativeEvent.locationX;
    const next = Math.round((touchX / trackWidth) * span + min);
    const clamped = Math.max(min, Math.min(max, next));

    if (clamped === lastEmitted.current) return;
    lastEmitted.current = clamped;
    onChange(clamped);
  };

  const measure = (event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width);

  return (
    <View className="w-full mb-6">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider">{label}</Text>
        <Text className="text-xl font-black text-[#00f2fe] font-mono">
          {value}
          {unit}
        </Text>
      </View>

      <View
        // A 32px-tall strip so the whole row is grabbable, not just the 4px
        // of visible track.
        className="h-8 justify-center"
        onLayout={measure}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={handleTouch}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
      >
        {/* pointerEvents="none" on both children: neither may become the
            target of a touch, or `locationX` stops being an offset along the
            track. This is what fixes the value sticking near the ends. */}
        <View pointerEvents="none" className="h-1 w-full bg-white/10 rounded-full">
          <View style={{ width: position }} className="h-full bg-[#00f2fe] rounded-full" />
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: position - THUMB_SIZE / 2,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: '#00f2fe',
            borderWidth: 4,
            borderColor: '#01040a',
            shadowColor: '#00f2fe',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 10,
            elevation: 5,
          }}
        />
      </View>
    </View>
  );
};

export default CustomSlider;
