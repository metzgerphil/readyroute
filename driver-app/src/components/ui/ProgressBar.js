import { StyleSheet, View } from 'react-native';

import appTheme from '../../theme/appTheme';

export default function ProgressBar({ fillStyle, progress = 0, style, trackStyle }) {
  return (
    <View style={[styles.track, trackStyle, style]}>
      <View style={[styles.fill, fillStyle, { width: `${Math.min(100, Math.max(0, progress))}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: appTheme.colors.progressTrack,
    borderRadius: appTheme.progress.radius,
    height: appTheme.progress.height,
    overflow: 'hidden'
  },
  fill: {
    backgroundColor: appTheme.colors.progressFill,
    borderRadius: appTheme.progress.radius,
    height: '100%'
  }
});
