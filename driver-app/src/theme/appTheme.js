const colors = {
  background: '#edf3f6',
  backgroundWarm: '#f7f3ee',
  surface: '#ffffff',
  surfaceMuted: '#f7fafc',
  surfaceTint: '#fdf7f2',
  overlay: 'rgba(11, 23, 32, 0.28)',
  textPrimary: '#173042',
  textSecondary: '#647584',
  textTertiary: '#7e8d99',
  textInverse: '#ffffff',
  border: '#d8e2e8',
  borderStrong: '#c7d3dc',
  divider: '#e7edf1',
  charcoal: '#173042',
  charcoalSoft: '#253746',
  orange: '#ff7a1a',
  orangeDeep: '#d95f00',
  orangeSoft: '#fff1e6',
  orangeBorder: '#ffd6b8',
  purple: '#6f53d9',
  purpleSoft: '#f1ecff',
  green: '#248a57',
  greenSoft: '#e7f7ef',
  greenText: '#21643f',
  warning: '#c96b12',
  warningSoft: '#fff4ea',
  warningText: '#a14a0f',
  danger: '#cc4b37',
  dangerSoft: '#ffefec',
  dangerText: '#9b271f',
  infoSoft: '#eef4f8',
  infoText: '#556673',
  grayBadge: '#eef3f6',
  grayBadgeText: '#556673',
  mapOverlaySurface: 'rgba(255, 255, 255, 0.96)',
  mapOverlayBorder: 'rgba(216, 226, 232, 0.96)',
  mapHandle: '#cad4dc',
  progressTrack: '#edf2f5',
  progressFill: '#ff7a1a'
};

const spacing = {
  xxs: 4,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  xxxl: 40
};

const radius = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 34,
  pill: 999
};

const typography = {
  caption: 11,
  eyebrow: 12,
  bodySmall: 13,
  body: 15,
  bodyLarge: 17,
  label: 14,
  titleSmall: 18,
  titleMedium: 22,
  titleLarge: 28,
  display: 34,
  statValue: 28,
  lineHeights: {
    caption: 14,
    bodySmall: 18,
    body: 22,
    bodyLarge: 24,
    titleSmall: 24,
    titleMedium: 28,
    titleLarge: 34,
    display: 40
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800'
  }
};

const shadows = {
  card: {
    elevation: 2,
    shadowColor: '#173042',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16
  },
  lifted: {
    elevation: 4,
    shadowColor: '#173042',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20
  },
  sheet: {
    elevation: 8,
    shadowColor: '#173042',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18
  }
};

const buttons = {
  height: 40,
  compactHeight: 34,
  radius: 18,
  horizontalPadding: spacing.md
};

const badges = {
  height: 30,
  radius: radius.pill,
  horizontalPadding: 12
};

const cards = {
  radius: radius.lg,
  padding: spacing.lg,
  gap: spacing.md
};

const progress = {
  height: 8,
  radius: radius.pill
};

const icons = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 28
};

const mapOverlay = {
  radius: radius.xl,
  padding: spacing.lg,
  borderWidth: 1
};

const bottomSheet = {
  radius: radius.xxl,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  handleWidth: 64,
  handleHeight: 7
};

export const appTheme = {
  badges,
  bottomSheet,
  buttons,
  cards,
  colors,
  icons,
  mapOverlay,
  progress,
  radius,
  shadows,
  spacing,
  typography
};

appTheme.colors.white = appTheme.colors.textInverse;
appTheme.colors.text = appTheme.colors.textPrimary;
appTheme.colors.textMuted = appTheme.colors.textSecondary;
appTheme.colors.textSoft = appTheme.colors.textTertiary;
appTheme.colors.charcoalMuted = appTheme.colors.charcoalSoft;
appTheme.typography.heading = appTheme.typography.titleLarge;
appTheme.typography.cardTitle = appTheme.typography.titleMedium;

export default appTheme;
