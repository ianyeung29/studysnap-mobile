// components/WaveformAnimation.tsx — Animated audio indicator
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Colors } from "@/constants/theme";

interface WaveformAnimationProps {
  active: boolean;
  color?: string;
}

export default function WaveformAnimation({
  active,
  color = Colors.recording,
}: WaveformAnimationProps) {
  // 5 bars animation values
  const animations = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(1))
  ).current;

  useEffect(() => {
    let animators: Animated.CompositeAnimation[] = [];

    if (active) {
      // Start looping animation for each bar with varying speeds and min/max heights
      animators = animations.map((anim, index) => {
        const duration = 600 + index * 150;
        const toValue = 2.5 + Math.random() * 2;

        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue,
              duration,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration,
              useNativeDriver: true,
            }),
          ])
        );
      });

      animators.forEach((anim) => anim.start());
    } else {
      // Stop animations and reset heights
      animations.forEach((anim) => {
        anim.stopAnimation();
        Animated.timing(anim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }

    return () => {
      animators.forEach((anim) => anim.stop());
    };
  }, [active, animations]);

  return (
    <View style={styles.container}>
      {animations.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 6,
  },
  bar: {
    width: 6,
    height: 12,
    borderRadius: 3,
  },
});
