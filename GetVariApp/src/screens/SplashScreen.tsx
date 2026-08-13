import React, { useEffect } from 'react';
import { View, SafeAreaView, Text } from 'react-native';
import BrandLogo from '../components/BrandLogo';
import NotificationService from '../services/NotificationService';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const SplashScreen = ({ navigation }: any) => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // Tapping a reminder is a request to log water *now* — 4.5s of branding
    // before the chat even starts loading reads as the app ignoring the tap.
    (async () => {
      const openedFromReminder = await NotificationService.hasPendingHydrationPrompt().catch(
        () => false
      );
      if (cancelled) return;
      timer = setTimeout(() => navigation.replace('Loading'), openedFromReminder ? 400 : 4500);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-[#02050e] justify-center items-center">
      {/* Background Glows */}
      <View style={{ position: 'absolute', width: 820, height: 820, borderRadius: 410, top: '50%', left: '50%', marginLeft: -410, marginTop: -410, backgroundColor: '#002832', opacity: 0.6 }} />

      <Animated.View
        entering={FadeIn.duration(1000)}
        exiting={FadeOut.duration(800)}
        className="items-center"
      >
        <BrandLogo size={120} animated={true} fillProgress={1} />

        <View className="absolute bottom-[-150] items-center">
          <Text className="text-[10px] text-neutral-600 font-mono tracking-widest uppercase">
            Hydration Intelligence — Secure Session
          </Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

export default SplashScreen;
