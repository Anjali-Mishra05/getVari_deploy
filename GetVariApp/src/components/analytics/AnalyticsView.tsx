import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  CalendarDays,
  ChartColumn,
  Clock,
  Flame,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react-native';

import GlassCard from '../GlassCard';
import { CARD_GAP, CARD_PADDING, cardStyle } from '../dashboard/cardTheme';
import { ACCENT } from '../dashboard/riskTheme';
import HydrationService from '../../services/HydrationService';
import type { HydrationLog } from '../../types';
import {
  computeStreak,
  dailyTotals,
  DayTotal,
  formatVolume,
  hourlyRhythm,
  weekSummary,
} from '../../utils/analytics';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Enough for the streak, the 30-day chart, the heatmap and last week's comparison. */
const HISTORY_DAYS = 35;

const MUTED = '#64748b';
const FLAME = '#fb923c';
const MET = '#34d399';

interface AnalyticsViewProps {
  userId: string | null;
  /** The daily goal, or null while it is unknown. */
  targetMl: number | null;
  /**
   * Today's entries from the dashboard. When they change (the user logged
   * something) the history is read again, so the charts never lag the log.
   */
  todayLogs: HydrationLog[];
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({
  icon,
  title,
  right,
}) => (
  <View className="flex-row items-center justify-between mb-4">
    <View className="flex-row items-center gap-2">
      {icon}
      <Text className="text-[10px] uppercase tracking-[0.2em] font-black text-white/80">{title}</Text>
    </View>
    {right}
  </View>
);

const StatTile: React.FC<{ label: string; value: string; accent?: string; sub?: React.ReactNode }> = ({
  label,
  value,
  accent = '#ffffff',
  sub,
}) => (
  <View className="flex-1 bg-white/[0.03] border border-white/5 rounded-2xl px-3 py-3">
    <Text
      className="text-[8px] uppercase tracking-widest font-black text-neutral-500"
      numberOfLines={1}
      adjustsFontSizeToFit
      maxFontSizeMultiplier={1.2}
    >
      {label}
    </Text>
    <Text
      className="text-[17px] font-black mt-1"
      style={{ color: accent }}
      numberOfLines={1}
      adjustsFontSizeToFit
      maxFontSizeMultiplier={1.2}
    >
      {value}
    </Text>
    {sub}
  </View>
);

/** A ring that sweeps from empty to `progress` (0–1) when its value changes. */
const GoalRing: React.FC<{ progress: number; size: number; label: string; sub: string }> = ({
  progress,
  size,
  label,
  sub,
}) => {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: Math.min(1, Math.max(0, progress)),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, sweep]);

  const offset = sweep.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const met = progress >= 1;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={met ? MET : ACCENT} />
            <Stop offset="1" stopColor={met ? '#10b981' : '#3b82f6'} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text className="text-[18px] font-black text-white">{label}</Text>
      <Text className="text-[9px] font-bold text-neutral-400 mt-0.5">{sub}</Text>
    </View>
  );
};

/* ------------------------------------------------------------------ *
 * Bar chart — tap a bar to inspect that day
 * ------------------------------------------------------------------ */

const IntakeBars: React.FC<{
  days: DayTotal[];
  targetMl: number | null;
  width: number;
  selected: number;
  onSelect: (index: number) => void;
}> = ({ days, targetMl, width, selected, onSelect }) => {
  const height = 150;
  const labelSpace = 18;
  const chartH = height - labelSpace;
  const max = Math.max(targetMl ?? 0, ...days.map(d => d.totalMl), 1) * 1.1;
  const slot = width / days.length;
  const barW = Math.max(3, Math.min(26, slot * 0.62));
  const dense = days.length > 10;

  // Bars grow from the baseline whenever the range changes.
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [days.length, grow]);

  const goalY = targetMl ? chartH - (targetMl / max) * chartH : null;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={ACCENT} />
          <Stop offset="1" stopColor="#1d4ed8" stopOpacity={0.7} />
        </LinearGradient>
        <LinearGradient id="barMet" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={MET} />
          <Stop offset="1" stopColor="#047857" stopOpacity={0.8} />
        </LinearGradient>
      </Defs>

      {[0.25, 0.5, 0.75].map(f => (
        <Line
          key={f}
          x1={0}
          x2={width}
          y1={chartH * f}
          y2={chartH * f}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
      ))}

      {days.map((day, i) => {
        const h = Math.max(day.totalMl > 0 ? 3 : 0, (day.totalMl / max) * chartH);
        const x = i * slot + (slot - barW) / 2;
        const isSel = i === selected;
        const animatedH = grow.interpolate({ inputRange: [0, 1], outputRange: [0, h] });
        const animatedY = grow.interpolate({ inputRange: [0, 1], outputRange: [chartH, chartH - h] });
        return (
          <G key={day.start} onPress={() => onSelect(i)}>
            {/* Full-height hit area so short bars are easy to tap. */}
            <Rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
            {isSel && (
              <Rect
                x={i * slot + 1}
                y={0}
                width={slot - 2}
                height={chartH}
                rx={8}
                fill="rgba(0,242,254,0.06)"
              />
            )}
            <AnimatedRect
              x={x}
              y={animatedY}
              width={barW}
              height={animatedH}
              rx={Math.min(6, barW / 2)}
              fill={day.goalMet ? 'url(#barMet)' : 'url(#barGrad)'}
              opacity={isSel ? 1 : 0.75}
            />
            {(!dense || i % 5 === 4 || i === days.length - 1) && (
              <SvgText
                x={i * slot + slot / 2}
                y={height - 4}
                fontSize={9}
                fontWeight="700"
                fill={isSel ? ACCENT : MUTED}
                textAnchor="middle"
              >
                {dense ? String(day.dayOfMonth) : day.label}
              </SvgText>
            )}
          </G>
        );
      })}

      {goalY !== null && (
        <>
          <Line
            x1={0}
            x2={width}
            y1={goalY}
            y2={goalY}
            stroke={MET}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.7}
          />
          <SvgText x={width - 2} y={goalY - 4} fontSize={8} fontWeight="800" fill={MET} textAnchor="end">
            GOAL
          </SvgText>
        </>
      )}
    </Svg>
  );
};

/* ------------------------------------------------------------------ *
 * Drinking rhythm — a 24-hour clock of when water goes in
 * ------------------------------------------------------------------ */

const polar = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

const wedge = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string => {
  const p0 = polar(cx, cy, r0, a0);
  const p1 = polar(cx, cy, r1, a0);
  const p2 = polar(cx, cy, r1, a1);
  const p3 = polar(cx, cy, r0, a1);
  return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} A ${r1} ${r1} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r0} ${r0} 0 0 0 ${p0.x} ${p0.y} Z`;
};

const RhythmClock: React.FC<{
  buckets: number[];
  size: number;
  selected: number | null;
  onSelect: (hour: number) => void;
}> = ({ buckets, size, selected, onSelect }) => {
  const cx = size / 2;
  const cy = size / 2;
  // Leaves a margin for the hour labels drawn just outside the ring, which
  // were clipped by the canvas edge at 0.46.
  const inner = size * 0.18;
  const outer = size * 0.4;
  const max = Math.max(...buckets, 1);
  const step = (2 * Math.PI) / 24;
  const peak = buckets.indexOf(Math.max(...buckets));

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={outer} stroke="rgba(255,255,255,0.05)" strokeWidth={1} fill="none" />
      <Circle cx={cx} cy={cy} r={inner} stroke="rgba(255,255,255,0.08)" strokeWidth={1} fill="none" />
      {buckets.map((ml, hour) => {
        // Midnight at the top, running clockwise.
        const a0 = -Math.PI / 2 + hour * step + 0.03;
        const a1 = a0 + step - 0.06;
        const r1 = inner + Math.max(ml > 0 ? 0.12 : 0.03, ml / max) * (outer - inner);
        const isSel = selected === hour;
        const color = isSel ? '#ffffff' : hour === peak && ml > 0 ? FLAME : ACCENT;
        return (
          <G key={hour} onPress={() => onSelect(hour)}>
            <Path d={wedge(cx, cy, inner, outer, a0, a1)} fill="transparent" />
            <Path
              d={wedge(cx, cy, inner, r1, a0, a1)}
              fill={color}
              opacity={ml > 0 ? (isSel ? 1 : 0.35 + 0.65 * (ml / max)) : 0.12}
            />
          </G>
        );
      })}
      {[0, 6, 12, 18].map(h => {
        const p = polar(cx, cy, outer + 10, -Math.PI / 2 + h * step);
        return (
          <SvgText key={h} x={p.x} y={p.y + 3} fontSize={8} fontWeight="800" fill={MUTED} textAnchor="middle">
            {String(h).padStart(2, '0')}
          </SvgText>
        );
      })}
    </Svg>
  );
};

/* ------------------------------------------------------------------ *
 * 5-week heatmap
 * ------------------------------------------------------------------ */

const Heatmap: React.FC<{
  days: DayTotal[];
  targetMl: number | null;
  width: number;
  selected: number | null;
  onSelect: (index: number) => void;
}> = ({ days, targetMl, width, selected, onSelect }) => {
  const cols = 7;
  const gap = 6;
  const cell = (width - gap * (cols - 1)) / cols;
  const rows = Math.ceil(days.length / cols);
  const ref = targetMl && targetMl > 0 ? targetMl : Math.max(...days.map(d => d.totalMl), 1);

  return (
    <Svg width={width} height={rows * (cell * 0.62 + gap)}>
      {days.map((day, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ratio = Math.min(1, day.totalMl / ref);
        const isToday = i === days.length - 1;
        const isSel = i === selected;
        const h = cell * 0.62;
        return (
          <G key={day.start} onPress={() => onSelect(i)}>
            <Rect
              x={col * (cell + gap)}
              y={row * (h + gap)}
              width={cell}
              height={h}
              rx={7}
              fill={day.goalMet ? MET : ACCENT}
              opacity={day.totalMl > 0 ? 0.18 + 0.82 * ratio : 0.06}
              stroke={isSel ? '#ffffff' : isToday ? ACCENT : 'transparent'}
              strokeWidth={isSel || isToday ? 1.5 : 0}
            />
            <SvgText
              x={col * (cell + gap) + cell / 2}
              y={row * (h + gap) + h / 2 + 3}
              fontSize={9}
              fontWeight="800"
              fill={ratio > 0.6 ? '#020617' : '#94a3b8'}
              textAnchor="middle"
            >
              {day.dayOfMonth}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
};

/* ------------------------------------------------------------------ *
 * The tab
 * ------------------------------------------------------------------ */

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ userId, targetMl, todayLogs }) => {
  const { width: windowWidth } = useWindowDimensions();
  // Screen padding (16 each side) plus the card's own padding and border.
  const innerWidth = windowWidth - 32 - CARD_PADDING * 2 - 2;

  const [history, setHistory] = useState<HydrationLog[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const result = await HydrationService.fetchLogsForDays(HISTORY_DAYS, userId);
    setFailed(result.failed);
    if (!result.failed || history === null) setHistory(result.logs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Read again whenever today's entries change, so a new log shows at once.
  useEffect(() => {
    void load();
  }, [load, todayLogs.length]);

  const allDays = useMemo(
    () => dailyTotals(history ?? [], HISTORY_DAYS, targetMl),
    [history, targetMl]
  );
  const streak = useMemo(() => computeStreak(allDays), [allDays]);
  const week = useMemo(() => weekSummary(allDays), [allDays]);
  const rangeDays = useMemo(() => allDays.slice(-range), [allDays, range]);
  const heatDays = useMemo(() => allDays.slice(-35), [allDays]);
  const rhythm = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);
    return hourlyRhythm(history ?? [], since.getTime());
  }, [history]);

  const barIndex = selectedBar === null || selectedBar >= rangeDays.length ? rangeDays.length - 1 : selectedBar;
  const barDay = rangeDays[barIndex];
  const peakHour = rhythm.indexOf(Math.max(...rhythm));
  const shownHour = selectedHour ?? (rhythm[peakHour] > 0 ? peakHour : null);
  const cellDay = selectedCell !== null ? heatDays[selectedCell] : null;
  const last7 = allDays.slice(-7);

  if (history === null) {
    return (
      <View className="items-center justify-center py-24">
        {failed ? (
          <>
            <Text className="text-neutral-400 text-[12px] mb-3">Couldn't load your history.</Text>
            <TouchableOpacity
              onPress={() => void load()}
              className="px-4 py-2 rounded-xl border border-white/10"
              accessibilityRole="button"
            >
              <Text className="text-[11px] font-black text-[#00f2fe]">RETRY</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={ACCENT} />
        )}
      </View>
    );
  }

  const dayName = (day: DayTotal, index: number, length: number) =>
    index === length - 1
      ? 'Today'
      : index === length - 2
      ? 'Yesterday'
      : new Date(day.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <View>
      {failed && (
        <Text className="text-[10px] text-amber-400 mb-3 text-center">
          Offline — showing the last history loaded.
        </Text>
      )}

      {/* ---------------------------------------------------- Streak */}
      <GlassCard className="bg-white/[0.01]" style={cardStyle}>
        <SectionTitle icon={<Flame color={FLAME} size={17} />} title="Hydration Streak" />
        <View className="flex-row items-center">
          <View className="items-center mr-5">
            <Flame
              color={streak.current > 0 ? FLAME : MUTED}
              size={46}
              fill={streak.current > 0 ? FLAME : 'transparent'}
              fillOpacity={0.25}
            />
          </View>
          <View className="flex-1">
            <Text className="text-[34px] font-black text-white leading-[38px]">
              {streak.current}
              <Text className="text-[13px] text-neutral-400"> {streak.current === 1 ? 'day' : 'days'}</Text>
            </Text>
            <Text className="text-[11px] text-neutral-400 mt-1">
              {targetMl === null
                ? 'Set up your goal to start a streak.'
                : streak.todayMet
                ? 'Goal met today — streak extended!'
                : streak.current > 0
                ? `Hit today's goal to make it ${streak.current + 1}.`
                : "Reach today's goal to start a streak."}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-2">
              <Trophy color="#fbbf24" size={12} />
              <Text className="text-[10px] font-bold text-amber-300">
                Best: {streak.best} {streak.best === 1 ? 'day' : 'days'}
              </Text>
            </View>
          </View>
        </View>

        {/* The last seven days as a chain of links. */}
        <View className="flex-row justify-between mt-5">
          {last7.map((day, i) => {
            const isToday = i === last7.length - 1;
            return (
              <View key={day.start} className="items-center">
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: day.goalMet ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.04)',
                    borderWidth: isToday ? 1.5 : 1,
                    borderColor: day.goalMet ? MET : isToday ? ACCENT : 'rgba(255,255,255,0.08)',
                  }}
                >
                  {day.goalMet ? (
                    <Flame color={FLAME} size={14} fill={FLAME} fillOpacity={0.4} />
                  ) : (
                    <Text className="text-[9px] font-black text-neutral-500">{day.dayOfMonth}</Text>
                  )}
                </View>
                <Text className="text-[8px] font-black mt-1" style={{ color: isToday ? ACCENT : MUTED }}>
                  {isToday ? 'TODAY' : day.label.toUpperCase()}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassCard>

      {/* ---------------------------------------------------- This week */}
      <View className="flex-row gap-2.5" style={{ marginBottom: CARD_GAP }}>
        <StatTile label="This week" value={formatVolume(week.totalMl)} accent={ACCENT} />
        <StatTile label="Daily avg" value={formatVolume(week.averageMl)} />
        <StatTile
          label="Goal days"
          value={`${week.daysMet}/7`}
          accent={MET}
          sub={
            week.changeVsLastWeek !== null ? (
              <View className="flex-row items-center gap-1 mt-1">
                {week.changeVsLastWeek >= 0 ? (
                  <TrendingUp color={MET} size={10} />
                ) : (
                  <TrendingDown color="#f43f5e" size={10} />
                )}
                <Text
                  className="text-[8px] font-black flex-shrink"
                  style={{ color: week.changeVsLastWeek >= 0 ? MET : '#f43f5e' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  maxFontSizeMultiplier={1.1}
                >
                  {week.changeVsLastWeek >= 0 ? '+' : ''}
                  {week.changeVsLastWeek}% vs last wk
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* ---------------------------------------------------- Intake chart */}
      <GlassCard className="bg-white/[0.01]" style={cardStyle}>
        <SectionTitle
          icon={<ChartColumn color={ACCENT} size={17} />}
          title="Daily Intake"
          right={
            <View className="flex-row bg-white/[0.04] rounded-xl p-0.5 border border-white/5">
              {([7, 30] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => {
                    setRange(r);
                    setSelectedBar(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: range === r }}
                  className="px-3 py-1 rounded-lg"
                  style={{ backgroundColor: range === r ? 'rgba(0,242,254,0.15)' : 'transparent' }}
                >
                  <Text className="text-[10px] font-black" style={{ color: range === r ? ACCENT : MUTED }}>
                    {r}D
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        />
        <IntakeBars
          days={rangeDays}
          targetMl={targetMl}
          width={innerWidth}
          selected={barIndex}
          onSelect={setSelectedBar}
        />
        {barDay && (
          <View className="flex-row items-center mt-4 bg-white/[0.02] border border-white/5 rounded-2xl p-3">
            <GoalRing
              size={92}
              progress={targetMl ? barDay.totalMl / targetMl : 0}
              label={targetMl ? `${Math.round((barDay.totalMl / targetMl) * 100)}%` : '--'}
              sub="of goal"
            />
            <View className="flex-1 ml-4">
              <Text className="text-[10px] uppercase tracking-widest font-black text-neutral-500">
                {dayName(barDay, barIndex, rangeDays.length)}
              </Text>
              <Text className="text-[22px] font-black text-white mt-0.5">{formatVolume(barDay.totalMl)}</Text>
              <Text className="text-[10px] text-neutral-400 mt-0.5">
                {barDay.entries} {barDay.entries === 1 ? 'entry' : 'entries'}
                {targetMl ? ` · goal ${formatVolume(targetMl)}` : ''}
              </Text>
              <Text className="text-[10px] font-bold mt-1.5" style={{ color: barDay.goalMet ? MET : MUTED }}>
                {barDay.goalMet
                  ? '✓ Goal reached'
                  : targetMl
                  ? `${formatVolume(Math.max(0, targetMl - barDay.totalMl))} short`
                  : ''}
              </Text>
            </View>
          </View>
        )}
        <Text className="text-[9px] text-neutral-500 text-center mt-2.5">Tap a bar to see that day</Text>
      </GlassCard>

      {/* ---------------------------------------------------- Rhythm */}
      <GlassCard className="bg-white/[0.01]" style={cardStyle}>
        <SectionTitle icon={<Clock color="#a78bfa" size={17} />} title="Drinking Rhythm · 7 days" />
        <View className="flex-row items-center">
          <RhythmClock
            buckets={rhythm}
            size={Math.min(190, innerWidth * 0.58)}
            selected={selectedHour}
            onSelect={hour => setSelectedHour(prev => (prev === hour ? null : hour))}
          />
          <View className="flex-1 ml-3">
            {shownHour !== null ? (
              <>
                <Text className="text-[10px] uppercase tracking-widest font-black text-neutral-500">
                  {selectedHour === null ? 'Peak hour' : 'Selected hour'}
                </Text>
                <Text
                  className="text-[20px] font-black text-white mt-0.5"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {String(shownHour).padStart(2, '0')}:00–{String((shownHour + 1) % 24).padStart(2, '0')}:00
                </Text>
                <Text className="text-[11px] mt-1" style={{ color: selectedHour === null ? FLAME : ACCENT }}>
                  {formatVolume(rhythm[shownHour])} this week
                </Text>
              </>
            ) : (
              <Text className="text-[11px] text-neutral-400">Log some water to see when you drink most.</Text>
            )}
            <Text className="text-[9px] text-neutral-500 mt-3 leading-[13px]">
              Each spoke is an hour of the day. Longer spokes mean more water. Tap one to inspect it.
            </Text>
          </View>
        </View>
      </GlassCard>

      {/* ---------------------------------------------------- Heatmap */}
      <GlassCard className="bg-white/[0.01]" style={cardStyle}>
        <SectionTitle
          icon={<CalendarDays color={MET} size={17} />}
          title="5-Week Heatmap"
          right={
            cellDay ? (
              <Text className="text-[10px] font-black text-white">
                {new Date(cellDay.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
                {formatVolume(cellDay.totalMl)}
              </Text>
            ) : null
          }
        />
        <Heatmap
          days={heatDays}
          targetMl={targetMl}
          width={innerWidth}
          selected={selectedCell}
          onSelect={i => setSelectedCell(prev => (prev === i ? null : i))}
        />
        <View className="flex-row items-center justify-end gap-3 mt-2">
          <View className="flex-row items-center gap-1">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: ACCENT, opacity: 0.5 }} />
            <Text className="text-[8px] font-bold text-neutral-500">Some water</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: MET }} />
            <Text className="text-[8px] font-bold text-neutral-500">Goal met</Text>
          </View>
        </View>
      </GlassCard>
    </View>
  );
};

export default AnalyticsView;
