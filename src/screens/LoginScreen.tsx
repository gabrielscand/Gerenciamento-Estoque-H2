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
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Acesso ao Estoque</Text>
        <Text style={styles.subtitle}>
          Entre com usuario e senha para abrir o sistema.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Usuario</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Digite seu usuario"
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
                color="#6D28D9"
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.submitButton, isSubmitting ? styles.submitButtonDisabled : undefined]}
          disabled={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: 18,
    gap: 12,
  },
  title: {
    color: '#4C1D95',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#6D28D9',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: '#6D28D9',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    color: '#3B0764',
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
    right: 10,
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 17,
  },
  submitButton: {
    marginTop: 6,
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
