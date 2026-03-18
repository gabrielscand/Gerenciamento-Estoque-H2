import { StyleSheet, Text, View } from 'react-native';

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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 2,
  },
  containerNormal: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
  },
  containerWarning: {
    backgroundColor: '#FAE8FF',
    borderColor: '#E879F9',
  },
  containerEmpty: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  labelNormal: {
    color: '#6D28D9',
  },
  labelWarning: {
    color: '#A21CAF',
  },
  labelEmpty: {
    color: '#475569',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  valueNormal: {
    color: '#4C1D95',
  },
  valueWarning: {
    color: '#86198F',
  },
  valueEmpty: {
    color: '#334155',
  },
  helper: {
    fontSize: 12,
    fontWeight: '600',
  },
  helperNormal: {
    color: '#6D28D9',
  },
  helperWarning: {
    color: '#A21CAF',
  },
  helperEmpty: {
    color: '#64748B',
  },
});
