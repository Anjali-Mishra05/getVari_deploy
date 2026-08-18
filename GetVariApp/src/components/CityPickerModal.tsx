import React, { useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Check, Search } from 'lucide-react-native';

import { INDIAN_CITIES } from '../data/indianCities';

interface CityPickerModalProps {
  visible: boolean;
  /** Currently chosen city, highlighted in the list. */
  selectedCity?: string;
  /** Coordinates come back with the name — the climate model needs both. */
  onSelect: (city: string, lat: number, lon: number) => void;
  onClose: () => void;
}

/**
 * The searchable city sheet, shared by onboarding and the profile editor.
 *
 * The search box filters on city *and* state, because "Kerala" is how people
 * look for Kochi at least as often as "Kochi" is.
 */
const CityPickerModal: React.FC<CityPickerModalProps> = ({
  visible,
  selectedCity,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  const dismiss = () => {
    setQuery('');
    onClose();
  };

  const matches = INDIAN_CITIES.filter(
    c =>
      c.city.toLowerCase().includes(query.toLowerCase()) ||
      c.state.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity activeOpacity={1} onPress={dismiss} className="absolute inset-0" />

        <Animated.View
          entering={FadeInUp.duration(300)}
          className="w-full bg-[#01040a] border-t border-white/10 rounded-t-[42px] overflow-hidden h-[85%]"
        >
          <View className="items-center pt-3 pb-1">
            <View className="w-12 h-1 bg-white/10 rounded-full" />
          </View>

          <View className="p-6">
            <Text className="text-white font-black text-xl mb-6">Select Your City</Text>

            <View className="flex-row items-center bg-white/[0.03] border border-white/10 rounded-[24px] px-5 py-2">
              <Search size={20} color="#64748b" />
              <TextInput
                className="flex-1 ml-3 text-white text-[16px] font-medium h-12"
                placeholder="Search Indian cities..."
                placeholderTextColor="#475569"
                value={query}
                onChangeText={setQuery}
                autoFocus={false}
                underlineColorAndroid="transparent"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Text className="text-[#64748b] font-bold px-2">Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView
            className="flex-1 px-4"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {matches.map(c => (
              <TouchableOpacity
                key={`${c.city}-${c.state}`}
                onPress={() => {
                  onSelect(c.city, c.lat, c.lon);
                  setQuery('');
                }}
                className={`p-5 mb-2 rounded-[24px] flex-row justify-between items-center ${
                  selectedCity === c.city
                    ? 'bg-[#00f2fe]/10 border border-[#00f2fe]/30'
                    : 'bg-white/[0.02] border border-white/5'
                }`}
              >
                <View>
                  <Text
                    className={`text-[15px] font-bold ${
                      selectedCity === c.city ? 'text-[#00f2fe]' : 'text-neutral-200'
                    }`}
                  >
                    {c.city}
                  </Text>
                  <Text className="text-[10px] text-neutral-500 font-mono mt-0.5 uppercase tracking-widest">
                    {c.state}
                  </Text>
                </View>
                {selectedCity === c.city && <Check size={18} color="#00f2fe" />}
              </TouchableOpacity>
            ))}

            {matches.length === 0 && (
              <View className="py-20 items-center">
                <Text className="text-neutral-500 text-sm text-center">
                  No cities found matching your search
                </Text>
                <Text className="text-neutral-700 text-xs mt-2 italic">
                  Try searching for the state or a nearby hub
                </Text>
              </View>
            )}
            <View className="h-10" />
          </ScrollView>

          <SafeAreaView>
            <TouchableOpacity onPress={dismiss} className="p-6 items-center border-t border-white/5">
              <Text className="text-[#64748b] text-[12px] font-black uppercase tracking-widest">
                Close Picker
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default CityPickerModal;
