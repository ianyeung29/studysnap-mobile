import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { trackEvent } from "@/lib/analytics";

interface AuthSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export default function AuthSheet({ visible, onClose, onSuccess }: AuthSheetProps) {
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!visible) return;

    const handleDeepLink = async (event: { url: string }) => {
      const hash = event.url.split("#")[1];
      if (hash) {
        const params: Record<string, string> = {};
        hash.split("&").forEach((part) => {
          const [key, val] = part.split("=");
          if (key && val) params[key] = decodeURIComponent(val);
        });
        
        const accessToken = params["access_token"];
        const refreshToken = params["refresh_token"];

        if (accessToken && refreshToken) {
          setLoading(true);
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) throw error;

            if (data.session) {
              trackEvent("auth_success", { method: "oauth" });
              onSuccess(data.session.access_token);
            }
          } catch (err: any) {
            console.error("Deep link session extraction failed:", err);
            Alert.alert("Authentication Failed", err.message || "Failed to set session.");
          } finally {
            setLoading(false);
          }
        }
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.remove();
    };
  }, [visible]);

  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    setLoading(true);
    trackEvent("auth_started", { provider });

    try {
      const redirectUrl = Linking.createURL("auth-callback");
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        await Linking.openURL(data.url);
      } else {
        throw new Error("No authentication URL returned.");
      }
    } catch (err: any) {
      console.error(`${provider} Sign-in failed:`, err);
      Alert.alert("Authentication Failed", err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Development/Testing Bypass: Instantly signs in with a mock session
  const handleMockSignIn = async (tier: "free" | "premium") => {
    setLoading(true);
    trackEvent("mock_auth_clicked", { tier });

    try {
      const email = `${tier}_tester_${Math.random().toString(36).substring(7)}@studysnap.app`;
      
      // We sign up / sign in with a temporary passwordless email session or email/password
      // to generate a real valid JWT signed by Supabase Auth!
      const password = "StudySnapSecretPassword123!";
      
      let sessionRes = await supabase.auth.signUp({
        email,
        password,
      });

      if (sessionRes.error) {
        // If user already exists, sign in
        sessionRes = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      }

      if (sessionRes.error) throw sessionRes.error;

      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("No token returned in session.");

      trackEvent("auth_success", { method: "mock", tier });
      Alert.alert("Success", `Logged in successfully as ${email}!`);
      onSuccess(token);
    } catch (err: any) {
      console.error("Mock Sign-in failed:", err);
      Alert.alert("Auth Bypass Failed", err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>

          <Text style={styles.logoEmoji}>⚡</Text>
          <Text style={styles.title}>Unlock StudySnap</Text>
          <Text style={styles.subtitle}>
            Sign in with Gmail or iCloud to sync your study materials, share cost limits, and secure your account.
          </Text>

          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={Colors.accent2} />
              <Text style={styles.loaderText}>Securing connection...</Text>
            </View>
          ) : (
            <View style={styles.btnGroup}>
              {/* Google Sign In */}
              <TouchableOpacity
                style={[styles.authBtn, styles.googleBtn]}
                onPress={() => handleOAuthSignIn("google")}
                activeOpacity={0.8}
              >
                <FontAwesome name="google" size={20} color={Colors.white} style={styles.btnIcon} />
                <Text style={styles.btnText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Apple Sign In (Always visible or required on iOS) */}
              <TouchableOpacity
                style={[styles.authBtn, styles.appleBtn]}
                onPress={() => handleOAuthSignIn("apple")}
                activeOpacity={0.8}
              >
                <FontAwesome name="apple" size={20} color={Colors.white} style={styles.btnIcon} />
                <Text style={styles.btnText}>Continue with Apple</Text>
              </TouchableOpacity>

              {/* Development Bypass Section */}
              {__DEV__ && (
                <View style={styles.bypassSection}>
                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>DEVELOPMENT TESTING BYPASS</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <View style={styles.bypassBtns}>
                    <TouchableOpacity
                      style={[styles.authBtn, styles.bypassBtn, { backgroundColor: Colors.bgInput }]}
                      onPress={() => handleMockSignIn("free")}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnText, { color: Colors.textSecondary }]}>🧪 Sign In: Free Tester</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.authBtn, styles.bypassBtn, { backgroundColor: "rgba(255, 179, 0, 0.15)", borderColor: "#FFB300" }]}
                      onPress={() => handleMockSignIn("premium")}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.btnText, { color: "#FFB300" }]}>💎 Sign In: Premium Tester</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          <Text style={styles.footerText}>
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(9, 10, 15, 0.85)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: Radius.xl * 1.5,
    borderTopRightRadius: Radius.xl * 1.5,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    paddingTop: Spacing.xl * 1.5,
    alignItems: "center",
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.lg,
    right: Spacing.lg,
    padding: 6,
  },
  logoEmoji: {
    fontSize: 48,
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  loaderContainer: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: Spacing.md,
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  btnGroup: {
    width: "100%",
    gap: Spacing.md,
  },
  authBtn: {
    width: "100%",
    height: 52,
    borderRadius: Radius.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  googleBtn: {
    backgroundColor: "#DB4437",
  },
  appleBtn: {
    backgroundColor: "#000000",
    borderColor: Colors.border,
  },
  btnIcon: {
    marginRight: Spacing.sm,
  },
  btnText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  bypassSection: {
    width: "100%",
    marginTop: Spacing.md,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    marginHorizontal: Spacing.sm,
  },
  bypassBtns: {
    flexDirection: "column",
    gap: Spacing.sm,
  },
  bypassBtn: {
    borderColor: Colors.border,
    borderWidth: 1,
  },
  footerText: {
    fontSize: FontSize.xs - 2,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: Spacing.xl,
    lineHeight: 14,
  },
});
