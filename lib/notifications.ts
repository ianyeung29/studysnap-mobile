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

export async function scheduleCustomReminder(
  sessionId: string,
  sessionTitle: string,
  seconds: number,
  timeLabel: string
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

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📚 StudySnap: Study Session Reminder",
        body: `Time to review "${sessionTitle}"! Keep up your study streak.`,
        data: { sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: seconds,
      },
    });

    Alert.alert(
      "Reminder Scheduled! ⏰",
      `We will remind you to study this session in ${timeLabel}.`,
      [{ text: "Great" }]
    );
    return true;
  } catch (error) {
    console.error("Failed to schedule custom reminder:", error);
    Alert.alert("Error", "Could not schedule study reminder.");
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
