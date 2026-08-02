import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Heart,
  Activity,
  Droplets,
  Sparkles,
  Bell,
  Plus,
  Battery,
  TrendingUp,
  Cpu,
} from 'lucide-react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  interpolateColor,
  useAnimatedStyle
} from 'react-native-reanimated';

import BrandLogo from '../components/BrandLogo';
import GlassCard from '../components/GlassCard';
import { supabase } from '../services/SupabaseClient';
import { AuthService } from '../services/AuthService';
import { HydrationLog } from '../types';
import AquaSageChat from '../chatbot/AquaSageChat';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }: any) => {
  const [score, setScore] = useState(24);
  const [waterLogs, setWaterLogs] = useState<HydrationLog[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const progress = useSharedValue(0);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const userId = await AuthService.getCurrentUserId();
      console.log('[Supabase] Fetching data for user:', userId);
      if (!userId) return;

      // Fetch Profile
      const { data: profileRow, error: profileError } = await supabase
        .from('getvari_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('[Supabase] Error fetching profile:', profileError.message);
      } else if (profileRow?.profile) {
        console.log('[Supabase] Profile data loaded:', profileRow.profile);
        setUserProfile(profileRow.profile);
      }

      // Fetch Hydration Logs
      const { data: logsData, error: logsError } = await supabase
        .from('getvari_hydration_logs')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (logsError) {
        console.error('[Supabase] Error fetching logs:', logsError.message);
      } else if (logsData) {
        console.log('[Supabase] Logs data loaded:', logsData.length, 'entries');
        setWaterLogs(logsData.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          amountMl: l.amount_ml,
          source: l.source as any
        })));
      }
    } catch (error) {
      console.error('[Supabase] Fatal error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalWaterConsumed = waterLogs.reduce((acc, curr) => acc + curr.amountMl, 0);
  const targetMl = userProfile?.targetDailyMl || 2500;
  const targetPercent = Math.min(100, Math.round((totalWaterConsumed / targetMl) * 100));

  const logDrink = async (amountMl: number) => {
    try {
      const userId = await AuthService.getCurrentUserId();
      console.log('[Supabase] Attempting to log drink for user:', userId);

      if (!userId) {
        console.warn('[Supabase] Cannot log drink: No authenticated user ID found.');
        return;
      }

      const newLog = {
        id: `log_${userId}_${Date.now()}`,
        user_id: userId,
        timestamp: new Date().toISOString(),
        amount_ml: amountMl,
        source: 'manual',
      };

      const { data, error } = await supabase
        .from('getvari_hydration_logs')
        .insert(newLog)
        .select();

      if (error) {
        console.error('[Supabase] Error inserting log:', error.message, error.details);
        throw error;
      }

      console.log('[Supabase] Successfully logged drink:', data);

      // Update local state
      setWaterLogs(prev => [{
        id: newLog.id,
        timestamp: newLog.timestamp,
        amountMl: newLog.amount_ml,
        source: 'manual'
      }, ...prev]);

    } catch (error) {
      console.error('[Supabase] Fatal error in logDrink:', error);
    }
  };

  useEffect(() => {
    progress.value = withTiming(score / 100, { duration: 1500 });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: 477 - (477 * progress.value),
  }));

  const animatedScoreStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      ['#10b981', '#eab308', '#f43f5e']
    );
    return { color };
  });

  return (
    <View className="flex-1 bg-[#02050e]">
      {/* Background Atmosphere */}
      <View className="absolute inset-0">
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient id="bgGrad" cx="50%" cy="30%" rx="80%" ry="40%" fx="50%" fy="30%" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#1e293b" stopOpacity="0.15" />
              <Stop offset="100%" stopColor="#02050e" stopOpacity="1" />
            </RadialGradient>
          </Defs>
          <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View className="flex-row justify-between items-center mb-8">
            <View>
              <BrandLogo size={32} fillProgress={1} withText={true} textSize="sm" />
              <Text className="text-[9px] uppercase tracking-[0.3em] text-cyan-400 font-mono font-black mt-2">
                TELEMETRY ACTIVE
              </Text>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center">
                <Bell color="#94a3b8" size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                className="w-11 h-11 rounded-2xl bg-[#00f2fe] items-center justify-center shadow-xl shadow-cyan-500/30"
                onPress={() => logDrink(250)}
              >
                <Plus color="#020617" size={24} strokeWidth={3} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero Score Widget */}
          <GlassCard className="items-center py-12 mb-6 bg-white/[0.01]">
            <View className="absolute top-6 left-8">
              <Text className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono font-bold">SYSTEMIC RISK</Text>
              <View className="flex-row items-center gap-2 mt-1.5">
                <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                <Text className="text-xs font-black text-white uppercase tracking-wider">STABLE</Text>
              </View>
            </View>

            <View className="relative w-52 h-52 items-center justify-center">
               <Svg width="100%" height="100%" viewBox="0 0 160 160">
                  <Circle
                    cx="80"
                    cy="80"
                    r="76"
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth="8"
                    fill="none"
                  />
                  <AnimatedCircle
                    cx="80"
                    cy="80"
                    r="76"
                    stroke="#00f2fe"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray="477"
                    animatedProps={animatedProps}
                    strokeLinecap="round"
                    transform="rotate(-90 80 80)"
                  />
                </Svg>
                <View className="absolute items-center justify-center">
                  <Animated.Text
                    style={[{ fontSize: 64, fontWeight: '900', letterSpacing: -2 }, animatedScoreStyle]}
                  >
                    {score}
                  </Animated.Text>
                  <Text className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 font-mono font-black mt-[-5]">INDEX</Text>
                </View>
            </View>

            <View className="mt-10 px-6 w-full">
              <View className="bg-black/40 p-5 rounded-3xl border border-white/[0.05]">
                <Text className="text-[11px] text-neutral-400 leading-relaxed font-medium italic text-center">
                  {userProfile
                    ? `Physiological markers for ${userProfile.gender}, ${userProfile.weightKg}kg indicate stable recovery. Dynamic target synced at ${targetMl}ml.`
                    : `"Physiological markers indicate optimal recovery. Cellular hydration pool is currently synced at 92% efficiency."`}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* Vital Grid */}
          <View className="flex-row gap-4 mb-6">
            <GlassCard className="flex-1 p-5 bg-white/[0.01]">
              <View className="flex-row items-center gap-2 mb-3">
                <Droplets color="#00f2fe" size={14} />
                <Text className="text-[10px] font-black text-neutral-500 uppercase font-mono tracking-widest">Hydration</Text>
              </View>
              <View className="flex-row items-baseline gap-1.5">
                <Text className="text-3xl font-black text-white font-mono">{totalWaterConsumed}</Text>
                <Text className="text-[10px] text-neutral-500 font-mono font-bold">ML</Text>
              </View>
              <Text className="text-[9px] text-neutral-600 font-mono mt-1">{targetPercent}% OF GOAL</Text>
            </GlassCard>
            <GlassCard className="flex-1 p-5 bg-white/[0.01]">
              <View className="flex-row items-center gap-2 mb-3">
                <TrendingUp color="#a78bfa" size={14} />
                <Text className="text-[10px] font-black text-neutral-500 uppercase font-mono tracking-widest">Target</Text>
              </View>
              <View className="flex-row items-baseline gap-1.5">
                <Text className="text-3xl font-black text-white font-mono">{targetMl}</Text>
                <Text className="text-[10px] text-neutral-500 font-mono font-bold">ML</Text>
              </View>
              <Text className="text-[9px] text-neutral-600 font-mono mt-1 uppercase">{userProfile?.activityLevel || 'MODERATE'} LOAD</Text>
            </GlassCard>
          </View>

          {/* AI Insights Section */}
          <View className="mb-10">
            <View className="flex-row items-center justify-between mb-5 px-1">
               <View className="flex-row items-center gap-2.5">
                 <Sparkles color="#00f2fe" size={18} />
                 <Text className="text-[11px] font-black text-white uppercase tracking-[0.2em] font-mono">Core Insights</Text>
               </View>
               <TouchableOpacity>
                 <Text className="text-[10px] text-cyan-400 font-black font-mono tracking-widest">RE-SYNTHESIZE</Text>
               </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6">
              <GlassCard className="w-[290px] p-6 mr-4 border-cyan-500/20 bg-cyan-950/10 rounded-[32px]">
                <View className="flex-row items-center gap-3 mb-4">
                  <View className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                    <Droplets color="#00f2fe" size={16} />
                  </View>
                  <Text className="text-sm font-black text-white tracking-tight">Recovery Loop</Text>
                </View>
                <Text className="text-[12px] text-neutral-400 leading-relaxed font-medium">
                  Metabolic clearance is at peak efficiency. Maintain current fluid intake to buffer upcoming cardiac workload.
                </Text>
              </GlassCard>
              <GlassCard className="w-[290px] p-6 mr-4 border-violet-500/20 bg-violet-950/10 rounded-[32px]">
                <View className="flex-row items-center gap-3 mb-4">
                  <View className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/20">
                    <TrendingUp color="#a78bfa" size={16} />
                  </View>
                  <Text className="text-sm font-black text-white tracking-tight">Strain Alert</Text>
                </View>
                <Text className="text-[12px] text-neutral-400 leading-relaxed font-medium">
                  Atmospheric thermal stress is rising. Adjust electrolyte balance to offset potential perspiration rate spikes.
                </Text>
              </GlassCard>
            </ScrollView>
          </View>

          {/* Hardware Status */}
          <GlassCard className="flex-row items-center justify-between p-5 mb-12 border-white/5 bg-black/60 rounded-[32px]">
            <View className="flex-row items-center gap-4">
              <View className="p-2.5 bg-neutral-900 rounded-2xl border border-white/5">
                <Cpu color="#00f2fe" size={18} />
              </View>
              <View>
                <Text className="text-[10px] font-black text-white uppercase tracking-widest font-mono">ESP32 Core Link</Text>
                <View className="flex-row items-center gap-1.5 mt-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <Text className="text-[9px] text-neutral-500 font-mono font-bold uppercase tracking-widest">STREAMING ENCRYPTED</Text>
                </View>
              </View>
            </View>
            <View className="flex-row items-center gap-2.5 bg-white/[0.03] px-3 py-1.5 rounded-xl">
              <Battery color="#10b981" size={16} />
              <Text className="text-[11px] font-black text-emerald-500 font-mono">84%</Text>
            </View>
          </GlassCard>

          <View className="h-28" />
        </ScrollView>

        {/* Persistent Navigation Bar - Pixel Perfect Match */}
        <View className="absolute bottom-8 left-8 right-8 h-20 bg-neutral-950/90 border border-white/10 rounded-[28px] flex-row items-center justify-around px-4 shadow-2xl backdrop-blur-3xl">
          <TouchableOpacity className="items-center">
            <View className="w-12 h-12 rounded-2xl bg-neutral-800 border border-white/5 items-center justify-center">
              <TrendingUp color="#00f2fe" size={22} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity className="items-center">
            <View className="w-12 h-12 items-center justify-center">
              <Droplets color="#475569" size={22} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity className="items-center">
            <View className="w-12 h-12 items-center justify-center">
              <Activity color="#475569" size={22} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity className="items-center">
            <View className="w-12 h-12 items-center justify-center">
              <View className="w-7 h-7 rounded-full bg-neutral-800 border border-white/10 items-center justify-center">
                <Text className="text-[10px] font-black text-neutral-500">M</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <AquaSageChat userProfile={userProfile} />
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
