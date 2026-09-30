import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors, radius } from './theme';

interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 下から出るシート(PDFの「タスクを追加」) */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="title" size={22}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="閉じる" style={styles.close} testID="sheet-close">
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,42,92,0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.blueBorder, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 14, paddingBottom: 8 },
});
