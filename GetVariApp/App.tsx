import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import LoadingScreen from './src/screens/LoadingScreen';
import LoginScreen from './src/screens/LoginScreen';
import OtpScreen from './src/screens/OtpScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import PermissionGateScreen from './src/screens/PermissionGateScreen';

import usePermissionGate from './src/hooks/usePermissionGate';
import { allPermissionsGranted } from './src/utils/permissionRequirements';

const Stack = createStackNavigator();

/**
 * The permission gate is an opaque layer over the navigator, not a route.
 *
 * ## Why not a route
 *
 * As a `Stack.Screen` it would be one screen among several: reachable by
 * `navigate`, *leavable* by the hardware back button, and racing every other
 * screen that redirects on mount. A gate that back dismisses is not a gate.
 *
 * ## Why over the tree rather than instead of it
 *
 * Three of the four grants are given in Android's own settings, so the user
 * leaves the app to grant them and comes back. Swapping the navigator out for
 * the gate would unmount it, and returning with the permission granted would
 * drop the user on the splash screen to log in again — punishing them for
 * doing what was asked. Rendering the gate *above* a still-mounted navigator
 * costs one always-mounted view and returns them exactly where they were.
 *
 * The layer is opaque and fills the screen, so nothing underneath can be seen
 * or touched while it is up.
 */
function App(): React.JSX.Element {
  const { snapshot, checking, armed, refresh } = usePermissionGate();

  // `armed` holds the gate back until the onboarding wizard's last step — the
  // BLE pairing screen — has been completed, so the grants are asked for
  // between that screen and the dashboard rather than over the login.
  // `checking` covers the first read only: showing the gate before it lands
  // would flash a permission wall on every launch at users who granted
  // everything long ago.
  const blocked = armed && !checking && snapshot !== null && !allPermissionsGranted(snapshot);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Onboarding finishing is a navigation, not an app-state change, so
            the resume listener in `usePermissionGate` never sees it. Re-reading
            on every transition is what arms the gate the instant the wizard
            replaces itself with Home — and it is cheap, because a screen
            transition is a rare event and overlapping reads are discarded by
            the hook. */}
        <NavigationContainer onStateChange={() => void refresh()}>
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: '#02050e' }
            }}
          >
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Loading" component={LoadingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="OtpVerification" component={OtpScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
          </Stack.Navigator>
        </NavigationContainer>

        {blocked && (
          <View style={StyleSheet.absoluteFill} accessibilityViewIsModal accessibilityRole="alert">
            <PermissionGateScreen snapshot={snapshot!} onRecheck={refresh} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
