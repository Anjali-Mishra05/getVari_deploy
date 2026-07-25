import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import LoadingScreen from './src/screens/LoadingScreen';
import LoginScreen from './src/screens/LoginScreen';
import OtpScreen from './src/screens/OtpScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';

const Stack = createStackNavigator();

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
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
    </GestureHandlerRootView>
  );
}

export default App;
