import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const API_BASE = "https://studysnap-backend.vercel.app"; // Fallback URL or configure accordingly

// Centralized analytics helper
export async function getAnonymousInstallId(): Promise<string> {
  try {
    let installId = await AsyncStorage.getItem("device_install_id");
    if (!installId) {
      installId = "usr_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await AsyncStorage.setItem("device_install_id", installId);
    }
    return installId;
  } catch (err) {
    return "fallback_tester";
  }
}

export async function trackEvent(eventName: string, metadata?: Record<string, any>): Promise<void> {
  try {
    const userId = await getAnonymousInstallId();
    const appVersion = "1.0.0-beta";
    const platform = Platform.OS;

    console.log(`[Analytics Client] Track Event: ${eventName}`, metadata);

    // Call backend endpoint to store telemetry in scratch database & console
    // In local dev, use localhost:3000, or try relative/relative proxies if configured
    const localHost = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
    const url = `${localHost}/api/analytics`;

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        eventName,
        metadata,
        platform,
        appVersion,
      }),
    }).catch((err) => {
      // Fallback: try remote Vercel if local dev server isn't running
      const remoteUrl = `https://studysnap-backend.vercel.app/api/analytics`;
      fetch(remoteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          eventName,
          metadata,
          platform,
          appVersion,
        }),
      }).catch(() => {});
    });
  } catch (err) {
    console.warn("Telemetry tracking error", err);
  }
}

// Early client-side warnings to block calls locally if quota exceeded
export async function checkLocalDailyLimit(): Promise<{ allowed: boolean; count: number }> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const savedDate = await AsyncStorage.getItem("limit_date");
    const savedCount = await AsyncStorage.getItem("limit_generations_count");

    let count = 0;
    if (savedDate === today && savedCount) {
      count = parseInt(savedCount, 10);
    }

    // Daily limit
    const DAILY_BETA_LIMIT = 5;

    if (count >= DAILY_BETA_LIMIT) {
      return { allowed: false, count };
    }
    return { allowed: true, count };
  } catch (err) {
    return { allowed: true, count: 0 };
  }
}

export async function incrementLocalDailyLimit(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const savedDate = await AsyncStorage.getItem("limit_date");
    const savedCount = await AsyncStorage.getItem("limit_generations_count");

    let count = 1;
    if (savedDate === today && savedCount) {
      count = parseInt(savedCount, 10) + 1;
    }

    await AsyncStorage.setItem("limit_date", today);
    await AsyncStorage.setItem("limit_generations_count", count.toString());
  } catch (err) {
    console.warn("Failed to increment daily limits", err);
  }
}
