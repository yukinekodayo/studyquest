import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { toUserMessage } from '@/domain/errors';
import { Button } from './Button';
import { Text } from './Text';
import { colors } from './theme';

export function LoadingState({ label = 'よみこみ中…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry, message }: { error?: unknown; onRetry?: () => void; message?: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.inkFaint} />
      <Text variant="bodyBold" align="center">{message ?? toUserMessage(error)}</Text>
      {onRetry ? <Button label="もういちど" variant="soft" size="md" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" align="center">{title}</Text>
      {body ? <Text variant="body" color={colors.inkSoft} align="center">{body}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 36, paddingHorizontal: 24 },
});
