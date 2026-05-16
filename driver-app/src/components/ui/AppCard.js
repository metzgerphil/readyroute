import { StyleSheet, View } from 'react-native';

import appTheme from '../../theme/appTheme';

export default function AppCard({ children, style, tone = 'default', ...props }) {
  return (
    <View
      {...props}
      style={[styles.base, tone === 'muted' ? styles.muted : null, tone === 'tinted' ? styles.tinted : null, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.cards.radius,
    borderWidth: 1,
    padding: appTheme.cards.padding
  },
  muted: {
    backgroundColor: appTheme.colors.surfaceMuted
  },
  tinted: {
    backgroundColor: appTheme.colors.surfaceTint
  }
});
