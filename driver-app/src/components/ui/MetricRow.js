import { StyleSheet, Text, View } from 'react-native';

import RouteMetricIcon from '../RouteMetricIcon';
import appTheme from '../../theme/appTheme';

export default function MetricRow({ icon, text, tone = 'default' }) {
  const iconColor = tone === 'warning' ? appTheme.colors.warningText : appTheme.colors.charcoalSoft;
  const textColor = tone === 'warning' ? appTheme.colors.warningText : appTheme.colors.charcoalSoft;

  return (
    <View style={styles.row}>
      <RouteMetricIcon color={iconColor} name={icon} size={appTheme.icons.md} />
      <Text style={[styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm
  },
  text: {
    fontSize: 16,
    fontWeight: appTheme.typography.weights.semibold
  }
});
