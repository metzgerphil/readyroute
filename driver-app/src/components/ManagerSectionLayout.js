import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import managerTheme from '../theme/managerTheme';

export default function ManagerSectionLayout({
  actions = null,
  children,
  compact = false,
  eyebrow = 'Manager Mobile',
  scrollEnabled = true,
  subtitle,
  title,
  tone = 'dark'
}) {
  const isLight = tone === 'light';
  const bodyStyles = [styles.body, !scrollEnabled ? styles.bodyFill : null];
  const content = (
    <View style={styles.container}>
      <View style={[
        styles.heroCard,
        compact ? styles.heroCardCompact : null,
        isLight ? styles.heroCardLight : styles.heroCardDark,
        compact && isLight ? styles.heroCardCompactLight : null
      ]}>
        <Text style={[
          styles.eyebrow,
          compact ? styles.eyebrowCompact : null,
          isLight ? styles.eyebrowLight : styles.eyebrowDark
        ]}>{eyebrow}</Text>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[
              styles.title,
              compact ? styles.titleCompact : null,
              isLight ? styles.titleLight : styles.titleDark
            ]}>{title}</Text>
            {subtitle ? <Text style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              isLight ? styles.subtitleLight : styles.subtitleDark
            ]}>{subtitle}</Text> : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
      <View style={bodyStyles}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {scrollEnabled ? (
        <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: managerTheme.colors.background
  },
  contentContainer: {
    flexGrow: 1
  },
  container: {
    flex: 1,
    paddingHorizontal: managerTheme.spacing.lg,
    paddingTop: 64,
    paddingBottom: managerTheme.spacing.xl
  },
  heroCard: {
    borderRadius: managerTheme.radius.xl,
    marginBottom: managerTheme.spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 20
  },
  heroCardCompact: {
    marginBottom: managerTheme.spacing.xs,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  heroCardDark: {
    backgroundColor: managerTheme.colors.charcoal
  },
  heroCardLight: {
    ...managerTheme.shadows.card,
    backgroundColor: managerTheme.colors.surface,
    borderColor: managerTheme.colors.border,
    borderWidth: 1
  },
  heroCardCompactLight: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0
  },
  eyebrow: {
    fontSize: managerTheme.typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  eyebrowCompact: {
    marginBottom: managerTheme.spacing.xs
  },
  eyebrowDark: {
    color: '#dce8ef'
  },
  eyebrowLight: {
    color: managerTheme.colors.textSoft
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16
  },
  title: {
    fontSize: managerTheme.typography.heading,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 8
  },
  titleCompact: {
    fontSize: managerTheme.typography.titleMedium,
    lineHeight: managerTheme.typography.lineHeights.titleMedium,
    marginBottom: managerTheme.spacing.xxs
  },
  titleDark: {
    color: managerTheme.colors.white
  },
  titleLight: {
    color: managerTheme.colors.text
  },
  subtitle: {
    fontSize: managerTheme.typography.body,
    lineHeight: 22
  },
  subtitleCompact: {
    fontSize: managerTheme.typography.bodySmall,
    lineHeight: managerTheme.typography.lineHeights.bodySmall
  },
  subtitleDark: {
    color: '#dce8ef'
  },
  subtitleLight: {
    color: managerTheme.colors.textMuted
  },
  actions: {
    alignItems: 'flex-end'
  },
  body: {
    gap: 14
  },
  bodyFill: {
    flex: 1
  }
});
