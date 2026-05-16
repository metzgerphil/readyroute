import { StyleSheet, Text, View } from 'react-native';

import appTheme from '../../theme/appTheme';

export default function StatusBadge({ label, tone = 'neutral', style }) {
  const toneStyle = toneStyles[tone] || toneStyles.neutral;

  return (
    <View style={[styles.base, toneStyle.container, style]}>
      <Text style={[styles.label, toneStyle.label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: appTheme.badges.radius,
    justifyContent: 'center',
    minHeight: appTheme.badges.height,
    paddingHorizontal: appTheme.badges.horizontalPadding
  },
  label: {
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  }
});

const toneStyles = {
  neutral: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.grayBadge
    },
    label: {
      color: appTheme.colors.grayBadgeText
    }
  }),
  pending: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.orangeSoft
    },
    label: {
      color: appTheme.colors.orangeDeep
    }
  }),
  active: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.greenSoft
    },
    label: {
      color: appTheme.colors.greenText
    }
  }),
  complete: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.purpleSoft
    },
    label: {
      color: appTheme.colors.purple
    }
  }),
  warning: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.warningSoft
    },
    label: {
      color: appTheme.colors.warningText
    }
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: appTheme.colors.dangerSoft
    },
    label: {
      color: appTheme.colors.dangerText
    }
  })
};
