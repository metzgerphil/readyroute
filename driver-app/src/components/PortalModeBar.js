import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function PortalModeBar({ activeMode, availableModes, onSelectMode, title }) {
  if (!availableModes?.length) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {availableModes.length > 1 ? (
          <View style={styles.segmentedControl}>
            {availableModes.map((mode) => {
              const isActive = activeMode === mode;
              const label = mode === 'manager' ? 'Manager Portal' : 'Driver Portal';

              return (
                <Pressable
                  key={mode}
                  onPress={() => onSelectMode?.(mode)}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    isActive ? styles.segmentButtonActive : null,
                    pressed ? styles.segmentButtonPressed : null
                  ]}
                >
                  <Text style={[styles.segmentLabel, isActive ? styles.segmentLabelActive : null]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16
  },
  headerRow: {
    gap: 12
  },
  title: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700'
  },
  segmentedControl: {
    alignSelf: 'flex-start',
    backgroundColor: '#f2e8dd',
    borderRadius: 999,
    flexDirection: 'row',
    padding: 4
  },
  segmentButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  segmentButtonActive: {
    backgroundColor: '#173042'
  },
  segmentButtonPressed: {
    opacity: 0.9
  },
  segmentLabel: {
    color: '#6a625d',
    fontSize: 14,
    fontWeight: '700'
  },
  segmentLabelActive: {
    color: '#ffffff'
  }
});
