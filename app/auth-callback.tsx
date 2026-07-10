import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Immediately redirect back to the home screen.
    // The AuthSheet's deep link listener will handle setting the Supabase session in parallel.
    router.replace("/");
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={Colors.accent2} />
    </View>
  );
}
