import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatDateLabel,
  getTodayLocalDateString,
  parseDateStringToDate,
  parseDisplayDateToIso,
} from '../utils/date';

type DateFieldProps = {
  value: string;
  onChange: (nextValue: string) => void;
  label?: string;
  error?: string;
};

export function DateField({ value, onChange, label = 'Data', error }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [webInputValue, setWebInputValue] = useState(formatDateLabel(value));
  const [webInputError, setWebInputError] = useState('');

  const selectedDate = useMemo(() => {
    return parseDateStringToDate(value) ?? parseDateStringToDate(getTodayLocalDateString()) ?? new Date();
  }, [value]);

  function handleMobilePickerChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (event.type === 'dismissed') {
      setShowPicker(false);
      return;
    }

    if (nextDate) {
      onChange(getTodayLocalDateString(nextDate));
    }

    setShowPicker(false);
  }

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    setWebInputValue(formatDateLabel(value));
  }, [value]);

  function handleWebInputChange(nextValue: string) {
    setWebInputValue(nextValue);

    const trimmed = nextValue.trim();
    if (trimmed.length === 0) {
      setWebInputError('Informe a data em DD/MM/AAAA.');
      onChange(trimmed);
      return;
    }

    const parsedDate = parseDisplayDateToIso(trimmed);

    if (parsedDate) {
      setWebInputError('');
      onChange(parsedDate);
      return;
    }

    if (trimmed.length >= 10) {
      setWebInputError('Use uma data valida em DD/MM/AAAA.');
      onChange(trimmed);
    } else {
      setWebInputError('');
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={webInputValue}
          onChangeText={handleWebInputChange}
          placeholder="DD/MM/AAAA"
          keyboardType="numbers-and-punctuation"
          style={[styles.input, error || webInputError ? styles.inputError : undefined]}
        />
        {error || webInputError ? <Text style={styles.errorText}>{error || webInputError}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={[styles.mobileButton, error ? styles.inputError : undefined]}
        onPress={() => setShowPicker(true)}
      >
        <Text style={styles.mobileButtonText}>{formatDateLabel(value)}</Text>
      </Pressable>

      {showPicker ? (
        <DateTimePicker value={selectedDate} mode="date" display="default" onChange={handleMobilePickerChange} />
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#6D28D9',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#3B0764',
  },
  mobileButton: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileButtonText: {
    color: '#3B0764',
    fontSize: 14,
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
  },
});
