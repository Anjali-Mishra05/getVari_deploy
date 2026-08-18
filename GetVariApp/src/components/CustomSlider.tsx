import React from 'react';
import { Dimensions, Text, View } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * The touch-anywhere slider used for age and weight.
 *
 * Deliberately not a native slider: the app never ships a value the user did
 * not aim at, and a plain responder over a track is enough for two integer
 * fields. Shared by onboarding and the profile editor so the two screens
 * cannot drift apart.
 */
const CustomSlider = ({ min, max, value, onChange, label, unit = '' }: any) => {
  const sliderWidth = width - 120;
  const position = ((value - min) / (max - min)) * sliderWidth;

  const handleTouch = (event: any) => {
    const touchX = event.nativeEvent.locationX;
    let newValue = Math.round(((touchX / sliderWidth) * (max - min)) + min);
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
  };

  return (
    <View className="w-full mb-6">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider">{label}</Text>
        <Text className="text-xl font-black text-[#00f2fe] font-mono">{value}{unit}</Text>
      </View>
      <View
        className="h-6 justify-center"
        onStartShouldSetResponder={() => true}
        onResponderMove={handleTouch}
        onResponderRelease={handleTouch}
      >
        <View className="h-1 w-full bg-white/10 rounded-full">
          <View
            style={{ width: position }}
            className="h-full bg-[#00f2fe] rounded-full"
          />
        </View>
        <View
          style={{
            position: 'absolute',
            left: position - 10,
            width: 20,
            height: 20,
            borderRadius: 10,
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
