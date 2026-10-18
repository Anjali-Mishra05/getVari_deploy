import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Search } from 'lucide-react-native';

import Sheet from './ui/Sheet';
import { useScopedTheme } from '../theme/theme';
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
  const { cls, pick } = useScopedTheme();
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
    <Sheet
      visible={visible}
      onClose={dismiss}
      title="Select your city"
      subtitle="CLIMATE BASELINE"
      heightFraction={0.85}
    >
      <View className={cls('px-6 pt-4 pb-2')}>
        <View className={cls('flex-row items-center bg-white/[0.03] border border-white/10 rounded-[24px] px-5 py-2')}>
          <Search size={20} color="#64748b" />
          <TextInput
            className={cls('flex-1 ml-3 text-white text-[16px] font-medium h-12')}
            placeholder="Search Indian cities..."
            placeholderTextColor="#475569"
            value={query}
            onChangeText={setQuery}
            autoFocus={false}
            underlineColorAndroid="transparent"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text className={cls('text-[#64748b] font-bold px-2')}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

          <ScrollView
            className={cls('flex-1 px-4')}
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
                className={cls(`p-5 mb-2 rounded-[24px] flex-row justify-between items-center ${
                  selectedCity === c.city
                    ? 'bg-[#00f2fe]/10 border border-[#00f2fe]/30'
                    : 'bg-white/[0.02] border border-white/5'
                }`)}
              >
                <View>
                  <Text
                    className={cls(`text-[15px] font-bold ${
                      selectedCity === c.city ? 'text-[#00f2fe]' : 'text-neutral-200'
                    }`)}
                  >
                    {c.city}
                  </Text>
                  <Text className={cls('text-[10px] text-neutral-500 font-mono mt-0.5 uppercase tracking-widest')}>
                    {c.state}
                  </Text>
                </View>
                {selectedCity === c.city && <Check size={18} color={pick('#00f2fe', '#0891b2')} />}
              </TouchableOpacity>
            ))}

            {matches.length === 0 && (
              <View className={cls('py-20 items-center')}>
                <Text className={cls('text-neutral-500 text-sm text-center')}>
                  No cities found matching your search
                </Text>
                <Text className={cls('text-neutral-700 text-xs mt-2 italic')}>
                  Try searching for the state or a nearby hub
                </Text>
              </View>
            )}
        <View className={cls('h-10')} />
      </ScrollView>
    </Sheet>
  );
};

export default CityPickerModal;
