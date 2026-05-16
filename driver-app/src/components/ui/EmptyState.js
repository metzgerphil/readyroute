import { StyleSheet, Text, View } from 'react-native';

import AppButton from './AppButton';
import AppCard from './AppCard';
import appTheme from '../../theme/appTheme';

export default function EmptyState({ actionLabel, body, onAction, title }) {
  return (
    <AppCard style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} style={styles.button} variant="outline" /> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center'
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs,
    textAlign: 'center'
  },
  body: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    textAlign: 'center'
  },
  button: {
    marginTop: appTheme.spacing.md
  }
});
