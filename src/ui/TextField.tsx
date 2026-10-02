import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { colors, fonts, radius } from './theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, onFocus, onBlur, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.focused, error ? styles.inputError : null]}
      />
      {error ? <Text variant="caption" color={colors.red}>{error}</Text> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.beige,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  focused: { borderColor: colors.blue, backgroundColor: colors.white },
  inputError: { borderColor: colors.red, backgroundColor: colors.redSoft },
});
