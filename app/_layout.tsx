// app/_layout.tsx — Root layout with Expo Router
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { Colors } from "@/constants/theme";

// Suppress push notification token warnings generated inside Expo Go
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
]);

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.bgPrimary },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: { fontWeight: "700", color: Colors.textPrimary },
          contentStyle: { backgroundColor: Colors.bgPrimary },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="session"
          options={{
            title: "Recording Session",
            headerBackTitle: "Home",
            headerStyle: { backgroundColor: Colors.bgSecondary },
          }}
        />
        <Stack.Screen
          name="processing"
          options={{
            title: "Generating...",
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="results"
          options={{
            title: "Study Materials",
            headerBackTitle: "Sessions",
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            title: "Past Sessions",
            headerBackTitle: "Home",
          }}
        />
      </Stack>
    </>
  );
}
