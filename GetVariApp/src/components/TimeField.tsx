import React, { useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { Check, ChevronDown } from 'lucide-react-native';

import Sheet from './ui/Sheet';

import { formatClock, formatClockLabel } from '../utils/sleepWindow';

/**
 * Quarter-hour steps: a bedtime is an approximation, and 96 rows scroll far
 * more comfortably than 1,440 do. Anything finer would be false precision.
 */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => formatClock(index * 15));
const TIME_ROW_HEIGHT = 56;

/** Read-only field that opens a list of times — no native picker dependency. */
const TimeField = ({ label, caption, value, onChange, icon: Icon }: any) => {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, TIME_OPTIONS.indexOf(value));

  return (
    <View className="mb-5">
      <Text className="text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-3">
          <Icon size={16} color="#00f2fe" />
          <Text className="text-white text-[15px] font-black">{formatClockLabel(value)}</Text>
        </View>
        <ChevronDown size={14} color="#64748b" />
      </TouchableOpacity>
      {!!caption && <Text className="text-neutral-500 text-[10px] mt-2 leading-relaxed">{caption}</Text>}

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        subtitle="AN APPROXIMATE TIME IS ENOUGH"
        heightFraction={0.7}
      >
            <ScrollView
              ref={scrollRef}
              className="flex-1 px-4"
              showsVerticalScrollIndicator={false}
              // Opening on the current answer rather than at midnight saves the
              // user a long scroll every time they reopen the picker.
              onLayout={() =>
                scrollRef.current?.scrollTo({
                  y: Math.max(0, (selectedIndex - 2) * TIME_ROW_HEIGHT),
                  animated: false,
                })
              }
            >
              {TIME_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  style={{ height: TIME_ROW_HEIGHT - 8, marginBottom: 8 }}
                  className={`px-5 rounded-[20px] flex-row justify-between items-center ${
                    option === value ? 'bg-[#00f2fe]/10 border border-[#00f2fe]/30' : 'bg-white/[0.02] border border-white/5'
                  }`}
                >
                  <Text className={`text-[15px] font-bold ${option === value ? 'text-[#00f2fe]' : 'text-neutral-200'}`}>
                    {formatClockLabel(option)}
                  </Text>
                  {option === value && <Check size={18} color="#00f2fe" />}
                </TouchableOpacity>
              ))}
          <View className="h-10" />
        </ScrollView>
      </Sheet>
    </View>
  );
};

export default TimeField;
