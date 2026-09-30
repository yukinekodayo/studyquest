import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { colors, fonts, radius } from './theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? <Text variant="caption" color={colors.red}>{error}</Text> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.beige,
    paddingHorizontal: 16,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputError: { borderColor: colors.red, backgroundColor: colors.redSoft },
});
