export const tokens = {
  colors: {
    accent: '#77158e',
    accentStrong: '#5f1175',
    accentDeep: '#2a0834',
    accentSoft: '#f5eefd',
    accentSoftAlt: '#ede0f9',
    borderSoft: '#d8c3ea',
    borderStrong: '#b690d2',
    surface: '#ffffff',
    text: '#120d16',
    textSecondary: '#4e3f58',
    textMuted: '#6f617a',
    white: '#ffffff',
    black: '#000000',
    danger: '#a12020',
    dangerSoft: '#fdecec',
    warning: '#8d4f0e',
    warningSoft: '#fff4e7',
    success: '#2f8a5f',
    successSoft: '#eaf7f0',
    overlay: 'rgba(0,0,0,0.45)',
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
  },
};

export type AppTokens = typeof tokens;
