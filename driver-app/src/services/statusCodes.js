import AsyncStorage from '@react-native-async-storage/async-storage';

import api from './api';

const STATUS_CODES_KEY = 'fedex_status_codes';
const DELIVERY_COMPLETION_PRIORITY = ['014', '009', '013', '021', '019', '025'];

export async function loadStatusCodes() {
  const response = await api.get('/routes/status-codes');
  const codes = response.data?.codes || [];
  await AsyncStorage.setItem(STATUS_CODES_KEY, JSON.stringify(codes));
  return codes;
}

export async function getStatusCodes() {
  const cached = await AsyncStorage.getItem(STATUS_CODES_KEY);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_error) {
      await AsyncStorage.removeItem(STATUS_CODES_KEY);
    }
  }

  return loadStatusCodes();
}

export async function getCodesByCategory(category) {
  const codes = await getStatusCodes();
  return codes.filter((code) => code.category === category);
}

export async function getDeliveryCompletionCodes() {
  const categoryThreeCodes = await getCodesByCategory('3');
  const prioritizedCodes = [];
  const remainingCodes = [...categoryThreeCodes];

  for (const targetCode of DELIVERY_COMPLETION_PRIORITY) {
    const matchIndex = remainingCodes.findIndex((code) => code.code === targetCode);

    if (matchIndex >= 0) {
      prioritizedCodes.push(remainingCodes[matchIndex]);
      remainingCodes.splice(matchIndex, 1);
    }
  }

  remainingCodes.sort((left, right) => left.description.localeCompare(right.description));

  return [...prioritizedCodes, ...remainingCodes];
}

export { STATUS_CODES_KEY };
