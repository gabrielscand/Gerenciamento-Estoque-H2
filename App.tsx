import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { initDatabase } from './src/database';
import {
  ensureDefaultAdminUser,
  getCurrentSessionUser,
  logout,
} from './src/database/auth.repository';
import { refreshSyncStateFromDatabase, syncAppData } from './src/database/sync.service';
import { Tabs } from './src/navigation/Tabs';
import { LoginScreen } from './src/screens/LoginScreen';
import { TopPopupProvider } from './src/components/TopPopupProvider';
import type { AppUser } from './src/types/inventory';

type InitStatus = 'loading' | 'ready' | 'error';
const INIT_TIMEOUT_MS = Platform.OS === 'web' ? 30000 : 20000;

async function runWithTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout ao inicializar o app. Tente reiniciar o Expo.'));
    }, timeoutMs);

    task
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export default function App() {
  const [initStatus, setInitStatus] = useState<InitStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        let loggedUser: AppUser | null = null;

        await runWithTimeout(
          (async () => {
            await initDatabase();
            await refreshSyncStateFromDatabase();
            await syncAppData();
            await ensureDefaultAdminUser();
            loggedUser = await getCurrentSessionUser();
          })(),
          INIT_TIMEOUT_MS,
        );

        if (isMounted) {
          setSessionUser(loggedUser);
          setInitStatus('ready');
        }
      } catch (error) {
        console.error('Erro ao inicializar banco local', error);

        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Erro desconhecido ao inicializar o app.',
          );
          setInitStatus('error');
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  if (initStatus === 'loading') {
    return (
      <TopPopupProvider>
        <View style={styles.centeredContainer}>
          <StatusBar style="dark" />
          <ActivityIndicator size="large" />
          <Text style={styles.infoText}>Inicializando banco local...</Text>
        </View>
      </TopPopupProvider>
    );
  }

  if (initStatus === 'error') {
    return (
      <TopPopupProvider>
        <View style={styles.centeredContainer}>
          <StatusBar style="dark" />
          <Text style={styles.errorTitle}>Falha ao iniciar o aplicativo</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        </View>
      </TopPopupProvider>
    );
  }

  async function handleLogout() {
    await logout();
    setSessionUser(null);
  }

  async function refreshSessionUser() {
    const user = await getCurrentSessionUser();
    setSessionUser(user);
  }

  if (!sessionUser) {
    return (
      <TopPopupProvider>
        <StatusBar style="dark" />
        <LoginScreen
          onLoginSuccess={(user) => {
            setSessionUser(user);
          }}
        />
      </TopPopupProvider>
    );
  }

  return (
    <TopPopupProvider>
      <StatusBar style="dark" />
      <Tabs
        currentUser={sessionUser}
        onLogout={handleLogout}
        onUsersChanged={refreshSessionUser}
      />
    </TopPopupProvider>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#111827',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
});
