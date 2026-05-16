import { StyleSheet, Text } from 'react-native';

import AppButton from './AppButton';
import AppCard from './AppCard';
import appTheme from '../../theme/appTheme';

export default function ErrorState({ actionLabel = 'Retry', body, onAction, title = 'Something went wrong' }) {
  return (
    <AppCard style={styles.card} tone="tinted">
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {onAction ? <AppButton label={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: appTheme.colors.orangeBorder
  },
  title: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  body: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: appTheme.spacing.md
  }
});
