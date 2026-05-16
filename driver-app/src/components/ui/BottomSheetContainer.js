import { StyleSheet, View } from 'react-native';

import appTheme from '../../theme/appTheme';

export default function BottomSheetContainer({ children, style }) {
  return (
    <View style={[styles.sheet, style]}>
      <View style={styles.handle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    ...appTheme.shadows.sheet,
    backgroundColor: appTheme.colors.mapOverlaySurface,
    borderColor: appTheme.colors.mapOverlayBorder,
    borderTopLeftRadius: appTheme.bottomSheet.radius,
    borderTopRightRadius: appTheme.bottomSheet.radius,
    borderWidth: 1,
    paddingBottom: appTheme.bottomSheet.paddingBottom,
    paddingHorizontal: appTheme.bottomSheet.paddingHorizontal,
    paddingTop: appTheme.bottomSheet.paddingTop
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.mapHandle,
    borderRadius: appTheme.radius.pill,
    height: appTheme.bottomSheet.handleHeight,
    marginBottom: appTheme.spacing.md,
    width: appTheme.bottomSheet.handleWidth
  }
});
