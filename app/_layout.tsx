// app/_layout.tsx — Root layout with Expo Router
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Colors } from "@/constants/theme";

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
