// components/SubscriptionPaywall.tsx — Premium Store-compliant Subscription Paywall Modal overlay
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/constants/theme";
import { subscriptionService } from "@/lib/subscription";

interface SubscriptionPaywallProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

export default function SubscriptionPaywall({
  visible,
  onClose,
  onPurchaseSuccess,
}: SubscriptionPaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "quarterly" | "yearly">("yearly");
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      await subscriptionService.purchase(selectedPlan);
      setLoading(false);
      
      const planName = 
        selectedPlan === "yearly" ? "Yearly Access (7-Day Trial)" :
        selectedPlan === "quarterly" ? "Quarterly Access" : "Monthly Access";
      Alert.alert(
        "Welcome to StudySnap Premium! ⚡",
        `Your mock purchase of ${planName} was successful. All premium features are now unlocked!`,
        [
          {
            text: "Awesome",
            onPress: () => {
              onPurchaseSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Billing Error", err.message || "Could not complete transaction.");
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      await subscriptionService.restorePurchases();
      setLoading(false);
      Alert.alert(
        "Purchases Restored! ⚡",
        "Your active premium subscription has been successfully restored.",
        [
          {
            text: "Great",
            onPress: () => {
              onPurchaseSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Restoration Failed", err.message || "No active purchases found to restore.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Top Header & Close Trigger */}
          <View style={styles.header}>
            <Text style={styles.logo}>⚡ StudySnap Premium</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Outcome Pitch */}
            <Text style={styles.pitchTitle}>Master Your Semester</Text>
            <Text style={styles.pitchSub}>Unlock advanced AI study tooling to boost your grades.</Text>

            {/* Feature Checklist */}
            <View style={styles.featuresList}>
              <View style={styles.featureRow}>
                <Feather name="check" size={16} color={Colors.accent3} style={styles.checkIcon} />
                <Text style={styles.featureText}>Combine every class into one Master Exam</Text>
              </View>
              <View style={styles.featureRow}>
                <Feather name="check" size={16} color={Colors.accent3} style={styles.checkIcon} />
                <Text style={styles.featureText}>Unlimited lecture processing and audio imports</Text>
              </View>
              <View style={styles.featureRow}>
                <Feather name="check" size={16} color={Colors.accent3} style={styles.checkIcon} />
                <Text style={styles.featureText}>Full interactive practice quizzes & flashcard decks</Text>
              </View>
              <View style={styles.featureRow}>
                <Feather name="check" size={16} color={Colors.accent3} style={styles.checkIcon} />
                <Text style={styles.featureText}>Export study files directly to PDF or Anki decks</Text>
              </View>
            </View>

            {/* Selections Grid */}
            <Text style={styles.sectionTitle}>Choose your plan:</Text>
            <View style={styles.plansContainer}>
              {/* Yearly Card (Default / Recommended) */}
              <TouchableOpacity
                style={[styles.planCard, selectedPlan === "yearly" && styles.planCardActive]}
                activeOpacity={0.85}
                onPress={() => setSelectedPlan("yearly")}
              >
                <View style={styles.planCardLeft}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.planTitle}>Yearly Access</Text>
                    <View style={styles.badgeInline}>
                      <Text style={styles.badgeText}>7-DAY TRIAL</Text>
                    </View>
                  </View>
                  <Text style={styles.planSubtext}>$5.83/month equivalent · Save 27%</Text>
                </View>
                <View style={styles.planCardRight}>
                  <Text style={styles.planPriceInline}>$69.99/yr</Text>
                  <View style={[styles.planRadioInline, selectedPlan === "yearly" && styles.planRadioActive]}>
                    {selectedPlan === "yearly" && <View style={styles.planRadioInner} />}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Quarterly Card */}
              <TouchableOpacity
                style={[styles.planCard, selectedPlan === "quarterly" && styles.planCardActive]}
                activeOpacity={0.85}
                onPress={() => setSelectedPlan("quarterly")}
              >
                <View style={styles.planCardLeft}>
                  <Text style={styles.planTitle}>Quarterly Access</Text>
                  <Text style={styles.planSubtext}>$7.33/month equivalent · Save 8%</Text>
                </View>
                <View style={styles.planCardRight}>
                  <Text style={styles.planPriceInline}>$21.99/qtr</Text>
                  <View style={[styles.planRadioInline, selectedPlan === "quarterly" && styles.planRadioActive]}>
                    {selectedPlan === "quarterly" && <View style={styles.planRadioInner} />}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Monthly Card */}
              <TouchableOpacity
                style={[styles.planCard, selectedPlan === "monthly" && styles.planCardActive]}
                activeOpacity={0.85}
                onPress={() => setSelectedPlan("monthly")}
              >
                <View style={styles.planCardLeft}>
                  <Text style={styles.planTitle}>Monthly Access</Text>
                  <Text style={styles.planSubtext}>Billed monthly · Cancel anytime</Text>
                </View>
                <View style={styles.planCardRight}>
                  <Text style={styles.planPriceInline}>$7.99/mo</Text>
                  <View style={[styles.planRadioInline, selectedPlan === "monthly" && styles.planRadioActive]}>
                    {selectedPlan === "monthly" && <View style={styles.planRadioInner} />}
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Billing Disclosures */}
            <Text style={styles.disclosure}>
              Subscription automatically renews until canceled. Charges will apply at the end of the trial period for yearly, or immediately for quarterly/monthly. You can manage or cancel your subscription anytime in your app store settings.
            </Text>
          </ScrollView>

          {/* Action CTAs */}
          <View style={styles.footer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={Colors.white} />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.subscribeBtn}
                activeOpacity={0.9}
                onPress={handlePurchase}
              >
                <Text style={styles.subscribeBtnText}>
                  {selectedPlan === "yearly" ? "Start 7-Day Free Trial" : "Subscribe Now"}
                </Text>
                <Text style={styles.subscribeBtnSubtext}>
                  {selectedPlan === "yearly" ? "Then $69.99/year. Cancel anytime." :
                   selectedPlan === "quarterly" ? "$21.99/quarter. Cancel anytime." : "$7.99/month. Cancel anytime."}
                </Text>
              </TouchableOpacity>
            )}

            {/* Compliance Links Footer */}
            <View style={styles.linksRow}>
              <TouchableOpacity onPress={handleRestore}>
                <Text style={styles.linkText}>Restore Purchases</Text>
              </TouchableOpacity>
              <Text style={styles.linkDivider}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL("https://studysnap.app/terms")}>
                <Text style={styles.linkText}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.linkDivider}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL("https://studysnap.app/privacy")}>
                <Text style={styles.linkText}>Privacy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,10,15,0.85)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logo: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.black,
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  pitchTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  pitchSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: -Spacing.xs,
    paddingHorizontal: Spacing.md,
    lineHeight: 20,
  },
  featuresList: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  checkIcon: {
    marginTop: 2,
  },
  featureText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
    flex: 1,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.xs,
  },
  plansContainer: {
    flexDirection: "column",
    gap: Spacing.sm,
  },
  planCard: {
    width: "100%",
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 64,
  },
  planCardActive: {
    borderColor: Colors.accent3,
    backgroundColor: "rgba(168,85,247,0.05)",
  },
  planCardLeft: {
    flex: 1,
    gap: 4,
  },
  planCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  planPriceInline: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  planRadioInline: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeInline: {
    backgroundColor: Colors.accent3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  planTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  planSubtext: {
    fontSize: 9,
    color: Colors.textMuted,
    lineHeight: 12,
  },
  planRadioActive: {
    borderColor: Colors.accent3,
  },
  planRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent3,
  },
  disclosure: {
    fontSize: 10,
    color: Colors.textMuted,
    lineHeight: 14,
    textAlign: "center",
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  subscribeBtn: {
    width: "100%",
    backgroundColor: Colors.accent3,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  subscribeBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  subscribeBtnSubtext: {
    fontSize: 10,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  loadingContainer: {
    height: 48,
    justifyContent: "center",
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  linkText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  linkDivider: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});
