import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManagerSectionLayout({
  actions = null,
  children,
  eyebrow = 'Manager Mobile',
  scrollEnabled = true,
  subtitle,
  title
}) {
  const content = (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
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
    backgroundColor: '#edf3f6'
  },
  contentContainer: {
    flexGrow: 1
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 72,
    paddingBottom: 24
  },
  heroCard: {
    backgroundColor: '#ff7a1a',
    borderRadius: 30,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 20
  },
  eyebrow: {
    color: '#fff1e6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase'
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
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 8
  },
  subtitle: {
    color: '#fff3e8',
    fontSize: 15,
    lineHeight: 22
  },
  actions: {
    alignItems: 'flex-end'
  },
  body: {
    gap: 14
  }
});
