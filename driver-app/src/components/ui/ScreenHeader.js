import { StyleSheet, Text, View } from 'react-native';

import AppCard from './AppCard';
import appTheme from '../../theme/appTheme';

export default function ScreenHeader({ actions = null, eyebrow, subtitle, title }) {
  return (
    <AppCard style={styles.card}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <View style={styles.headerRow}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: appTheme.spacing.md
  },
  eyebrow: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 1,
    marginBottom: appTheme.spacing.sm,
    textTransform: 'uppercase'
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  copy: {
    flex: 1,
    paddingRight: appTheme.spacing.md
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleLarge,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleLarge,
    marginBottom: appTheme.spacing.xs
  },
  subtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  actions: {
    alignItems: 'flex-end'
  }
});
