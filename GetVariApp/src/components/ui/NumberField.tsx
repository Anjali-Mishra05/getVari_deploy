import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useScopedTheme } from '../../theme/theme';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Shown inside the field, after the number. */
  unit?: string;
  /** Sub-label under the field. The allowed range is appended automatically. */
  hint?: string;
}

/** Border colour when the typed value is outside the allowed range. */
const WARN = '#f59e0b';

/**
 * A typed numeric field for age and weight.
 *
 * These were sliders. A slider is the wrong control for a value the user knows
 * exactly: hitting 26 on a 14-90 track means landing on one of ~76 positions
 * across a few hundred pixels, and the reported defect ("weight and age scroll
 * bar are not smooth") is what that feels like on a phone. Typing "26" is two
 * taps and cannot be off by one.
 *
 * ## Why the text is kept as a string
 *
 * The field holds what the user typed, not the parsed number. Clamping every
 * keystroke to `min` makes the field impossible to edit — clear it to type
 * "85" and the empty string clamps to 14, so the first character you type lands
 * after it and you get "141". So an in-progress value (empty, or below `min`)
 * is left alone while the field has focus, and the clamp happens on blur.
 *
 * The parent is still only ever handed a valid in-range number.
 */
const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  hint,
}) => {
  const { cls, pick } = useScopedTheme();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow the parent when it changes the value from elsewhere (loading a
  // saved profile, say) — but never while the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parsed = Number.parseInt(text, 10);
  const isBlank = text.trim() === '';
  const outOfRange = !isBlank && Number.isFinite(parsed) && (parsed < min || parsed > max);

  const handleChange = (next: string) => {
    // Digits only. The keyboard is numeric, but a hardware keyboard, a paste
    // or a locale keypad can all still deliver something else.
    const digits = next.replace(/[^0-9]/g, '').slice(0, 3);
    setText(digits);

    const candidate = Number.parseInt(digits, 10);
    // Report only values that are already valid; anything else waits for blur.
    if (Number.isFinite(candidate) && candidate >= min && candidate <= max) {
      onChange(candidate);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const candidate = Number.parseInt(text, 10);
    // An empty or out-of-range field settles back to something valid rather
    // than being submitted as-is.
    const settled = Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : value;
    setText(String(settled));
    if (settled !== value) onChange(settled);
  };

  return (
    <View className={cls('w-full mb-6')}>
      <Text className={cls('text-[11px] text-neutral-400 font-mono uppercase tracking-wider mb-2')}>
        {label}
      </Text>

      <View
        className={cls('flex-row items-center bg-white/5 border rounded-xl px-4')}
        style={{
          borderColor: outOfRange
            ? 'rgba(245,158,11,0.6)'
            : focused
            ? pick('rgba(0,242,254,0.75)', 'rgba(8,145,178,0.8)')
            : pick('rgba(255,255,255,0.10)', 'rgba(24,24,27,0.15)'),
        }}
      >
        <TextInput
          className={cls('flex-1 text-white text-[20px] font-black font-mono py-3')}
          value={text}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={3}
          selectTextOnFocus
          placeholder={String(min)}
          placeholderTextColor="#475569"
          accessibilityLabel={label}
          underlineColorAndroid="transparent"
        />
        {!!unit && (
          <Text className={cls('text-[13px] text-neutral-400 font-mono font-bold ml-2')}>{unit}</Text>
        )}
      </View>

      <Text
        className={cls('text-[10px] mt-1.5 leading-[14px]')}
        style={{ color: outOfRange ? pick(WARN, '#b45309') : '#64748b' }}
      >
        {outOfRange
          ? `Enter a value between ${min} and ${max}${unit ? ` ${unit}` : ''}.`
          : `${hint ? `${hint} · ` : ''}${min}-${max}${unit ? ` ${unit}` : ''}`}
      </Text>
    </View>
  );
};

export default NumberField;
