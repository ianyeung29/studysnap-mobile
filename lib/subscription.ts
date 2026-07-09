// lib/subscription.ts — Dual-mode subscription entitlement manager (RevenueCat production & sandbox AsyncStorage mock)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";

const PREMIUM_KEY = "studysnap_premium_entitlement";

// API credentials configured in your RevenueCat projects dashboard
const API_KEYS = {
  apple: "appl_your_apple_api_key_placeholder",
  google: "goog_your_google_api_key_placeholder",
};

export interface PremiumEntitlement {
  isActive: boolean;
  expirationDate?: string;
  planId?: "monthly" | "quarterly" | "yearly";
}

export interface SubscriptionService {
  getEntitlement(): Promise<PremiumEntitlement>;
  purchase(planId: "monthly" | "quarterly" | "yearly"): Promise<PremiumEntitlement>;
  restorePurchases(): Promise<PremiumEntitlement>;
  cancelSubscription(): Promise<PremiumEntitlement>;
}

// ── AsyncStorage Mock Implementation (Staging / Expo Go sandbox fallback) ──
class MockSubscriptionService implements SubscriptionService {
  async getEntitlement(): Promise<PremiumEntitlement> {
    try {
      const raw = await AsyncStorage.getItem(PREMIUM_KEY);
      if (!raw) {
        return { isActive: false };
      }
      const entitlement: PremiumEntitlement = JSON.parse(raw);
      
      // Verify expiration date
      if (entitlement.isActive && entitlement.expirationDate) {
        const expiry = new Date(entitlement.expirationDate);
        if (expiry.getTime() < Date.now()) {
          console.log("[Subscription] Cached entitlement expired. Reverting to free.");
          const expiredEntitlement = { isActive: false };
          await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(expiredEntitlement));
          return expiredEntitlement;
        }
      }
      return entitlement;
    } catch (err) {
      console.error("[Subscription] Failed to load subscription state:", err);
      return { isActive: false };
    }
  }

  async purchase(planId: "monthly" | "quarterly" | "yearly"): Promise<PremiumEntitlement> {
    try {
      const expiry = new Date();
      if (planId === "yearly") {
        // 7 days free trial, then active for 1 year
        expiry.setDate(expiry.getDate() + 365 + 7);
      } else if (planId === "quarterly") {
        expiry.setMonth(expiry.getMonth() + 3);
      } else {
        expiry.setMonth(expiry.getMonth() + 1);
      }

      const newEntitlement: PremiumEntitlement = {
        isActive: true,
        planId,
        expirationDate: expiry.toISOString(),
      };

      await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(newEntitlement));
      console.log(`[Subscription] Mock purchase successful for: ${planId}`);
      return newEntitlement;
    } catch (err) {
      console.error("[Subscription] Failed to complete purchase:", err);
      throw new Error("Billing integration failed. Please try again.");
    }
  }

  async restorePurchases(): Promise<PremiumEntitlement> {
    try {
      const current = await this.getEntitlement();
      if (current.isActive) {
        return current;
      }

      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 365 + 7); // restore yearly with trial

      const restored: PremiumEntitlement = {
        isActive: true,
        planId: "yearly",
        expirationDate: expiry.toISOString(),
      };

      await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(restored));
      console.log("[Subscription] Mock purchase successfully restored!");
      return restored;
    } catch (err) {
      console.error("[Subscription] Failed to restore purchases:", err);
      throw new Error("Could not contact the App Store. Please check your connection.");
    }
  }

  async cancelSubscription(): Promise<PremiumEntitlement> {
    try {
      const canceled: PremiumEntitlement = { isActive: false };
      await AsyncStorage.setItem(PREMIUM_KEY, JSON.stringify(canceled));
      console.log("[Subscription] Mock subscription canceled.");
      return canceled;
    } catch (err) {
      console.error("[Subscription] Failed to cancel subscription:", err);
      return { isActive: false };
    }
  }
}

// ── RevenueCat Native Implementation with Mock Fallbacks ──
class RevenueCatSubscriptionService implements SubscriptionService {
  private mock = new MockSubscriptionService();

  async getEntitlement(): Promise<PremiumEntitlement> {
    try {
      const isConfigured = await Purchases.isConfigured();
      if (!isConfigured) {
        return await this.mock.getEntitlement();
      }
      const customerInfo = await Purchases.getCustomerInfo();
      const activeEntitlement = customerInfo.entitlements.active["premium_entitlement"];
      if (activeEntitlement) {
        return {
          isActive: activeEntitlement.isActive,
          expirationDate: activeEntitlement.expirationDate || undefined,
          planId: activeEntitlement.productIdentifier.toLowerCase().includes("yearly") ? "yearly" :
                  activeEntitlement.productIdentifier.toLowerCase().includes("quarterly") ? "quarterly" : "monthly",
        };
      }
      return { isActive: false };
    } catch (err) {
      console.warn("[SubscriptionService] RevenueCat native load failed, falling back to mock sandbox:", err);
      return await this.mock.getEntitlement();
    }
  }

  async purchase(planId: "monthly" | "quarterly" | "yearly"): Promise<PremiumEntitlement> {
    try {
      const isConfigured = await Purchases.isConfigured();
      if (!isConfigured) {
        return await this.mock.purchase(planId);
      }
      // Fetch offerings
      const offerings = await Purchases.getOfferings();
      if (offerings.current !== null) {
        const pkg = 
          planId === "yearly" ? offerings.current.annual :
          planId === "quarterly" ? offerings.current.threeMonth : offerings.current.monthly;
        
        if (pkg) {
          const { customerInfo } = await Purchases.purchasePackage(pkg);
          const activeEntitlement = customerInfo.entitlements.active["premium_entitlement"];
          if (activeEntitlement) {
            return {
              isActive: activeEntitlement.isActive,
              expirationDate: activeEntitlement.expirationDate || undefined,
              planId,
            };
          }
        }
      }
      throw new Error("Selected package not found in catalog catalog.");
    } catch (err: any) {
      if (err.userCancelled) {
        throw new Error("Transaction cancelled by user.");
      }
      console.warn("[SubscriptionService] RevenueCat native purchase failed, falling back to mock sandbox:", err);
      return await this.mock.purchase(planId);
    }
  }

  async restorePurchases(): Promise<PremiumEntitlement> {
    try {
      const isConfigured = await Purchases.isConfigured();
      if (!isConfigured) {
        return await this.mock.restorePurchases();
      }
      const customerInfo = await Purchases.restorePurchases();
      const activeEntitlement = customerInfo.entitlements.active["premium_entitlement"];
      if (activeEntitlement) {
        return {
          isActive: activeEntitlement.isActive,
          expirationDate: activeEntitlement.expirationDate || undefined,
          planId: activeEntitlement.productIdentifier.toLowerCase().includes("yearly") ? "yearly" :
                  activeEntitlement.productIdentifier.toLowerCase().includes("quarterly") ? "quarterly" : "monthly",
        };
      }
      throw new Error("No previous purchases found to restore.");
    } catch (err: any) {
      console.warn("[SubscriptionService] RevenueCat native restore failed, falling back to mock sandbox:", err);
      return await this.mock.restorePurchases();
    }
  }

  async cancelSubscription(): Promise<PremiumEntitlement> {
    // Client-side cancellation is handled via store subscription manager pages
    if (await Purchases.isConfigured()) {
      return { isActive: false };
    }
    return await this.mock.cancelSubscription();
  }
}

export const subscriptionService: SubscriptionService = new RevenueCatSubscriptionService();

// ── Native SDK Initialization Trigger ──
export async function configureSubscriptions(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const apiKey = Platform.select({
      ios: API_KEYS.apple,
      android: API_KEYS.google,
      default: "",
    });

    if (!apiKey || apiKey.includes("placeholder")) {
      console.log("[Subscription] Billing API key placeholder detected. Running in AsyncStorage sandbox mode.");
      return;
    }

    await Purchases.configure({ apiKey });
    console.log("[Subscription] RevenueCat native SDK configured successfully!");
  } catch (err) {
    console.warn("[Subscription] Failed to configure RevenueCat native modules (likely running in Expo Go sandbox):", err);
  }
}
