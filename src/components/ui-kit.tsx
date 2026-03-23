import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../theme/tokens';

export function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={[tokens.colors.accentSoft, '#ffffff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shellGradient}
      />
      <View pointerEvents="none" style={styles.shellDecoWrap}>
        <View style={styles.shellDecoOne} />
        <View style={styles.shellDecoTwo} />
      </View>
      <View style={styles.shellInner}>{children}</View>
    </View>
  );
}

export function MotionEntrance({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      delay,
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function HeroHeader({
  title,
  subtitle,
  description,
  children,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <LinearGradient
      colors={[tokens.colors.accentDeep, tokens.colors.accent]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <Text style={styles.heroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
      {description ? <Text style={styles.heroDescription}>{description}</Text> : null}
      {children ? <View style={styles.heroContent}>{children}</View> : null}
    </LinearGradient>
  );
}

export function SectionSurface({ children }: { children: ReactNode }) {
  return <View style={styles.surface}>{children}</View>;
}

export function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

export function AppButton({
  label,
  variant = 'primary',
  onPress,
  disabled = false,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : undefined,
        !isPrimary ? styles.buttonSecondary : undefined,
        isDanger ? styles.buttonDanger : undefined,
        pressed ? styles.buttonPressed : undefined,
        disabled ? styles.buttonDisabled : undefined,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          isPrimary ? styles.buttonTextPrimary : styles.buttonTextSecondary,
          isDanger ? styles.buttonTextDanger : undefined,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AppInput({
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.inputRoot}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={tokens.colors.textMuted}
        style={[styles.input, error ? styles.inputError : undefined]}
      />
      {error ? <Text style={styles.inputErrorText}>{error}</Text> : null}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'danger' | 'success';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'accent' ? styles.badgeAccent : undefined,
        tone === 'danger' ? styles.badgeDanger : undefined,
        tone === 'success' ? styles.badgeSuccess : undefined,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'accent' ? styles.badgeTextAccent : undefined,
          tone === 'danger' ? styles.badgeTextDanger : undefined,
          tone === 'success' ? styles.badgeTextSuccess : undefined,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {description ? <Text style={styles.emptyStateDescription}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: tokens.colors.accentSoft,
  },
  shellGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  shellDecoWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shellDecoOne: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 200,
    backgroundColor: 'rgba(119, 21, 142, 0.09)',
  },
  shellDecoTwo: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 220,
    backgroundColor: 'rgba(95, 17, 117, 0.08)',
  },
  shellInner: {
    flex: 1,
  },
  hero: {
    borderRadius: tokens.radius.xl,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.lg,
    gap: 6,
    ...tokens.shadow.card,
  },
  heroTitle: {
    color: tokens.colors.white,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  heroSubtitle: {
    color: '#EBDCF2',
    fontSize: 13,
    fontWeight: '700',
  },
  heroDescription: {
    color: '#F5EAFB',
    fontSize: 14,
    lineHeight: 20,
  },
  heroContent: {
    marginTop: 8,
    gap: 8,
  },
  surface: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    padding: tokens.spacing.md,
    ...tokens.shadow.card,
  },
  kpiTile: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: tokens.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 96,
    gap: 2,
  },
  kpiLabel: {
    color: '#EFE4F7',
    fontSize: 11,
    fontWeight: '700',
  },
  kpiValue: {
    color: tokens.colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  button: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accentStrong,
  },
  buttonSecondary: {
    backgroundColor: tokens.colors.accentSoft,
    borderColor: tokens.colors.borderStrong,
  },
  buttonDanger: {
    backgroundColor: '#8e1d1d',
    borderColor: '#751717',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  buttonTextPrimary: {
    color: tokens.colors.white,
  },
  buttonTextSecondary: {
    color: tokens.colors.accent,
  },
  buttonTextDanger: {
    color: tokens.colors.white,
  },
  inputRoot: {
    gap: 4,
  },
  input: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: '#f9f5fc',
    paddingHorizontal: 12,
    color: tokens.colors.text,
    fontSize: 14,
  },
  inputError: {
    borderColor: '#d95a5a',
  },
  inputErrorText: {
    color: tokens.colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D9C7E8',
    backgroundColor: '#F5EDFB',
  },
  badgeAccent: {
    borderColor: '#B690D2',
    backgroundColor: '#EEDDF9',
  },
  badgeDanger: {
    borderColor: '#F4B8B8',
    backgroundColor: '#FDECEC',
  },
  badgeSuccess: {
    borderColor: '#BEE3CF',
    backgroundColor: '#ECF8F1',
  },
  badgeText: {
    color: '#5F1175',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextAccent: {
    color: '#4E0F61',
  },
  badgeTextDanger: {
    color: '#9D2323',
  },
  badgeTextSuccess: {
    color: '#276C4B',
  },
  emptyState: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
  },
  emptyStateTitle: {
    color: tokens.colors.accentDeep,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateDescription: {
    color: tokens.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
