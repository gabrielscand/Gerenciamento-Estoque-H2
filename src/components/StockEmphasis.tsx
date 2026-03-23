import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

export type StockEmphasisTone = 'normal' | 'warning' | 'empty';

type StockEmphasisProps = {
  label: string;
  value: string;
  tone?: StockEmphasisTone;
  helperText?: string;
};

export function StockEmphasis({
  label,
  value,
  tone = 'normal',
  helperText,
}: StockEmphasisProps) {
  return (
    <View
      style={[
        styles.container,
        tone === 'warning'
          ? styles.containerWarning
          : tone === 'empty'
            ? styles.containerEmpty
            : styles.containerNormal,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === 'warning'
            ? styles.labelWarning
            : tone === 'empty'
              ? styles.labelEmpty
              : styles.labelNormal,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          tone === 'warning'
            ? styles.valueWarning
            : tone === 'empty'
              ? styles.valueEmpty
              : styles.valueNormal,
        ]}
      >
        {value}
      </Text>
      {helperText ? (
        <Text
          style={[
            styles.helper,
            tone === 'warning'
              ? styles.helperWarning
              : tone === 'empty'
                ? styles.helperEmpty
                : styles.helperNormal,
          ]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  containerNormal: {
    backgroundColor: '#F7F0FC',
    borderColor: tokens.colors.borderStrong,
  },
  containerWarning: {
    backgroundColor: '#FDEFD9',
    borderColor: '#E5BA82',
  },
  containerEmpty: {
    backgroundColor: '#FBF8FD',
    borderColor: tokens.colors.borderSoft,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  labelNormal: {
    color: tokens.colors.accent,
  },
  labelWarning: {
    color: '#8D4F0E',
  },
  labelEmpty: {
    color: tokens.colors.textMuted,
  },
  value: {
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 24,
  },
  valueNormal: {
    color: tokens.colors.accentDeep,
  },
  valueWarning: {
    color: '#7A420C',
  },
  valueEmpty: {
    color: tokens.colors.textSecondary,
  },
  helper: {
    fontSize: 11,
    fontWeight: '600',
  },
  helperNormal: {
    color: tokens.colors.accent,
  },
  helperWarning: {
    color: '#8D4F0E',
  },
  helperEmpty: {
    color: tokens.colors.textMuted,
  },
});
