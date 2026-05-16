import { Pressable, StyleSheet, Text, View } from 'react-native';

import appTheme from '../theme/appTheme';

export default function PortalModeBar({ activeMode, availableModes, onSelectMode, title }) {
  if (!availableModes?.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {availableModes.length > 1 ? (
          <View style={styles.segmentedControl}>
            {availableModes.map((mode) => {
              const isActive = activeMode === mode;
              const label = mode === 'manager' ? 'Manager Portal' : 'Driver Portal';

              return (
                <Pressable
                  key={mode}
                  onPress={() => onSelectMode?.(mode)}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    isActive ? styles.segmentButtonActive : null,
                    pressed ? styles.segmentButtonPressed : null
                  ]}
                >
                  <Text style={[styles.segmentLabel, isActive ? styles.segmentLabelActive : null]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: appTheme.spacing.md
  },
  headerRow: {
    gap: appTheme.spacing.sm
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.bold
  },
  segmentedControl: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    padding: appTheme.spacing.xxs
  },
  segmentButton: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  segmentButtonActive: {
    backgroundColor: appTheme.colors.charcoal
  },
  segmentButtonPressed: {
    opacity: 0.9
  },
  segmentLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  segmentLabelActive: {
    color: appTheme.colors.textInverse
  }
});
