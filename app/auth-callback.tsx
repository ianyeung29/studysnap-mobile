import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Alert, Text } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { Colors } from "@/constants/theme";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Completing sign-in...");

  useEffect(() => {
    let active = true;

    async function handleUrl(url: string) {
      console.log("[AuthCallback] Handling URL:", url);
      
      const params: Record<string, string> = {};
      const parseParams = (str: string) => {
        str.split("&").forEach((part) => {
          const [key, val] = part.split("=");
          if (key && val) params[key] = decodeURIComponent(val);
        });
      };

      const queryPart = url.split("?")[1]?.split("#")[0];
      if (queryPart) parseParams(queryPart);

      const hashPart = url.split("#")[1];
      if (hashPart) parseParams(hashPart);

      const accessToken = params["access_token"];
      const refreshToken = params["refresh_token"];

      if (accessToken && refreshToken) {
        try {
          if (active) setStatus("Connecting session...");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;
          console.log("[AuthCallback] Session set successfully!");
        } catch (err: any) {
          console.error("[AuthCallback] Error setting session:", err);
          Alert.alert("Authentication Failed", err.message || "Failed to set session.");
        }
      } else {
        console.warn("[AuthCallback] Missing tokens in URL:", url);
        Alert.alert(
          "Authentication Error",
          `Unable to complete sign-in.\n\nNo tokens were found in the redirect URL.\n\nReceived URL: ${url}\n\nParsed: ${JSON.stringify(params)}`
        );
      }

      if (active) {
        router.replace("/");
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url && url.includes("auth-callback")) {
        handleUrl(url);
      } else {
        router.replace("/");
      }
    });

    const subscription = Linking.addEventListener("url", (event) => {
      if (event.url && event.url.includes("auth-callback")) {
        handleUrl(event.url);
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={Colors.accent2} />
      <Text style={{ color: Colors.textMuted, marginTop: 15, fontSize: 14 }}>{status}</Text>
    </View>
  );
}
