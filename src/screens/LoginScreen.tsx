import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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
      <View style={styles.container}>
        <MotionEntrance>
          <HeroHeader
            title="H2 Estoque"
            subtitle="Acesso seguro"
            description="Controle operacional com sincronizacao e historico completo."
          />
        </MotionEntrance>

        <MotionEntrance delay={80}>
          <SectionSurface>
            <View style={styles.cardContent}>
              <Text style={styles.formTitle}>Entrar no sistema</Text>
              <Text style={styles.formSubtitle}>Informe usuario e senha para continuar.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Usuario</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Digite seu usuario"
                  placeholderTextColor={tokens.colors.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordInputContainer}>
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
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable
                    style={styles.passwordToggleButton}
                    onPress={() => setIsPasswordVisible((previous) => !previous)}
                    accessibilityRole="button"
                    accessibilityLabel={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    <Ionicons
                      name={isPasswordVisible ? 'eye' : 'eye-off'}
                      size={20}
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
                  label="Entrar"
                  onPress={() => {
                    void handleSubmit();
                  }}
                />
              )}
            </View>
          </SectionSurface>
        </MotionEntrance>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 14,
  },
  cardContent: {
    gap: 12,
  },
  formTitle: {
    color: tokens.colors.accentDeep,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  formSubtitle: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: tokens.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#F8F2FC',
    borderRadius: 12,
    color: tokens.colors.accentDeep,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  passwordInputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 46,
  },
  passwordToggleButton: {
    position: 'absolute',
    right: 8,
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E3FA',
    borderWidth: 1,
    borderColor: '#D8C3EA',
  },
  loadingButton: {
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: tokens.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
