// lib/notifications.ts — Spaced repetition alerts helper
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === "granted";
}

export async function scheduleSpacedRepetitionReminders(
  sessionId: string,
  sessionTitle: string
): Promise<boolean> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    Alert.alert(
      "Notifications Blocked",
      "Please enable notifications in settings to schedule study reminders."
    );
    return false;
  }

  try {
    // Cancel any existing notifications for this session to avoid duplicates
    await cancelRemindersForSession(sessionId);

    // Schedule 1 Day (86400 seconds)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📚 StudySnap: 1-Day Review",
        body: `Reviewing notes within 24 hours boosts retention by 80%. Let's review "${sessionTitle}"!`,
        data: { sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 86400,
      },
    });

    // Schedule 3 Days (259200 seconds)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🧠 StudySnap: 3-Day Reinforcement",
        body: `Re-evaluate concepts in "${sessionTitle}" to move them to long-term memory!`,
        data: { sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 259200,
      },
    });

    // Schedule 7 Days (604800 seconds)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎯 StudySnap: 7-Day Mastery",
        body: `Final review for "${sessionTitle}". Run a quick flashcard deck session!`,
        data: { sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 604800,
      },
    });

    Alert.alert(
      "Reminders Set! ⏰",
      "Study reminders scheduled for 1, 3, and 7 days. Spaced repetition active!",
      [{ text: "Awesome" }]
    );
    return true;
  } catch (error) {
    console.error("Failed to schedule reminders:", error);
    Alert.alert("Error", "Could not schedule study reminders.");
    return false;
  }
}

export async function cancelRemindersForSession(sessionId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.content.data?.sessionId === sessionId) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}
