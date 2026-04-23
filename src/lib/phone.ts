import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export type NormalizedPhoneNumber = {
  e164: string;
  display: string;
};

const DEFAULT_COUNTRY = 'IN';

export const normalizePhoneNumber = (value: string): NormalizedPhoneNumber | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const phoneNumber = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);

  if (!phoneNumber?.isValid()) {
    return null;
  }

  return {
    e164: phoneNumber.number,
    display: phoneNumber.formatInternational(),
  };
};

export const isValidPhoneNumber = (value: string) => normalizePhoneNumber(value) !== null;
