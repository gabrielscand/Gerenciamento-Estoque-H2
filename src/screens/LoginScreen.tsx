import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { login } from '../database/auth.repository';
import { useTopPopup } from '../components/TopPopupProvider';
import { AppButton, HeroHeader, MotionEntrance, ScreenShell, SectionSurface } from '../components/ui-kit';
import { tokens } from '../theme/tokens';
import type { AppUser } from '../types/inventory';

type LoginScreenProps = {
  onLoginSuccess: (user: AppUser) => void;
};

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const { width } = useWindowDimensions();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showTopPopup } = useTopPopup();

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await login(username, password);
      setPassword('');
      onLoginSuccess(user);
    } catch (error) {
      showTopPopup({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao entrar.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePasswordKeyPress(key: string) {
    if (Platform.OS === 'web' && key === 'Enter') {
      void handleSubmit();
    }
  }

  return (
    <ScreenShell>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.contentWrap, { maxWidth: width >= 960 ? 540 : 460 }]}>
            <MotionEntrance>
              <HeroHeader
                title="Login"
                subtitle="Acesso seguro"
                description="Informe usuario e senha para continuar no sistema."
              />
            </MotionEntrance>

            <MotionEntrance delay={80}>
              <SectionSurface>
                <View style={styles.formContent}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Usuario</Text>
                    <View
                      style={[
                        styles.inputPill,
                        focusedField === 'username' ? styles.inputPillFocused : undefined,
                      ]}
                    >
                      <View style={styles.leadingIconCircle}>
                        <Ionicons name="person-outline" size={18} color={tokens.colors.accent} />
                      </View>
                      <TextInput
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="Digite seu usuario"
                        placeholderTextColor={tokens.colors.textMuted}
                        style={styles.pillInput}
                        onFocus={() => setFocusedField('username')}
                        onBlur={() => {
                          setFocusedField((current) => (current === 'username' ? null : current));
                        }}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Senha</Text>
                    <View
                      style={[
                        styles.inputPill,
                        focusedField === 'password' ? styles.inputPillFocused : undefined,
                      ]}
                    >
                      <View style={styles.leadingIconCircle}>
                        <Ionicons name="lock-closed-outline" size={16} color={tokens.colors.accent} />
                      </View>
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        onSubmitEditing={() => {
                          void handleSubmit();
                        }}
                        onKeyPress={(event) => {
                          handlePasswordKeyPress(event.nativeEvent.key);
                        }}
                        secureTextEntry={!isPasswordVisible}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="Digite sua senha"
                        placeholderTextColor={tokens.colors.textMuted}
                        returnKeyType="done"
                        style={styles.pillInput}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => {
                          setFocusedField((current) => (current === 'password' ? null : current));
                        }}
                      />
                      <Pressable
                        style={styles.trailingIconButton}
                        onPress={() => setIsPasswordVisible((previous) => !previous)}
                        accessibilityRole="button"
                        accessibilityLabel={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        <Ionicons
                          name={isPasswordVisible ? 'eye' : 'eye-off'}
                          size={18}
                          color={tokens.colors.accent}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {isSubmitting ? (
                    <View style={styles.loadingButton}>
                      <ActivityIndicator color={tokens.colors.white} />
                    </View>
                  ) : (
                    <AppButton
                      label="LOGIN"
                      onPress={() => {
                        void handleSubmit();
                      }}
                    />
                  )}
                </View>
              </SectionSurface>
            </MotionEntrance>

            <View style={styles.footerHintWrap}>
              <Text style={styles.footerHint}>Use as mesmas credenciais ja cadastradas no sistema.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  contentWrap: {
    width: '100%',
    gap: tokens.spacing.sm,
  },
  formContent: {
    gap: tokens.spacing.md,
  },
  inputGroup: {
    gap: tokens.spacing.xs,
  },
  label: {
    color: tokens.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inputPill: {
    minHeight: 54,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    paddingLeft: 8,
    paddingRight: 8,
    ...tokens.shadow.card,
  },
  inputPillFocused: {
    borderColor: tokens.colors.accent,
  },
  leadingIconCircle: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accentSoft,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
  },
  pillInput: {
    flex: 1,
    minHeight: 46,
    marginLeft: 8,
    marginRight: 6,
    paddingVertical: 8,
    color: tokens.colors.accentDeep,
    fontSize: 15,
    fontWeight: '600',
  },
  trailingIconButton: {
    height: 34,
    width: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accentSoft,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
  },
  loadingButton: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.accent,
    borderWidth: 1,
    borderColor: tokens.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerHintWrap: {
    paddingHorizontal: tokens.spacing.sm,
  },
  footerHint: {
    color: tokens.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
