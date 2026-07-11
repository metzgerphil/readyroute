import { Pressable, StyleSheet, Text } from 'react-native';

import appTheme from '../../theme/appTheme';

export default function AppButton({ disabled = false, label, onPress, style, textStyle, variant = 'primary' }) {
  const buttonVariant = variantStyles[variant] || variantStyles.primary;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        buttonVariant.button,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style
      ]}
    >
      <Text style={[styles.text, buttonVariant.text, disabled ? styles.disabledText : null, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: appTheme.buttons.radius,
    justifyContent: 'center',
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  text: {
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  pressed: {
    opacity: 0.92
  },
  disabled: {
    opacity: 0.58
  },
  disabledText: {
    opacity: 0.9
  }
});

const variantStyles = {
  primary: StyleSheet.create({
    button: {
      ...appTheme.shadows.card,
      backgroundColor: appTheme.colors.orange
    },
    text: {
      color: appTheme.colors.textInverse
    }
  }),
  secondary: StyleSheet.create({
    button: {
      ...appTheme.shadows.card,
      backgroundColor: appTheme.colors.charcoal
    },
    text: {
      color: appTheme.colors.textInverse
    }
  }),
  outline: StyleSheet.create({
    button: {
      backgroundColor: appTheme.colors.surface,
      borderColor: appTheme.colors.border,
      borderWidth: 1
    },
    text: {
      color: appTheme.colors.textPrimary
    }
  }),
  ghost: StyleSheet.create({
    button: {
      backgroundColor: appTheme.colors.surfaceTint
    },
    text: {
      color: appTheme.colors.textPrimary
    }
  }),
  danger: StyleSheet.create({
    button: {
      backgroundColor: appTheme.colors.danger
    },
    text: {
      color: appTheme.colors.textInverse
    }
  })
};
