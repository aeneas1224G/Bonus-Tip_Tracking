/**
 * Employee PIN rules, in one place.
 *
 * Changing PIN_LENGTH here changes the login pad, the admin forms, the seed
 * script and every validator — nothing else hard-codes a digit count.
 */

export const PIN_LENGTH = 6;

/** 10^PIN_LENGTH — the size of the keyspace, used in the security copy. */
export const PIN_KEYSPACE = 10 ** PIN_LENGTH;

export const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** For the `pattern` attribute on an <input>, which takes a bare string. */
export const PIN_INPUT_PATTERN = `\\d{${PIN_LENGTH}}`;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * Reject the PINs an attacker would try first. With six digits the keyspace is
 * a million, but that only helps if people do not pick 123456 or 111111 —
 * those few patterns are a meaningful slice of what humans actually choose.
 */
export function isWeakPin(pin: string): boolean {
  if (!isValidPinFormat(pin)) return false; // format errors are reported separately

  // Every digit the same: 000000, 777777.
  if (/^(\d)\1*$/.test(pin)) return true;

  // A short block repeated to fill the length: 121212, 123123, 454545.
  for (let block = 1; block <= PIN_LENGTH / 2; block += 1) {
    if (PIN_LENGTH % block !== 0) continue;
    const head = pin.slice(0, block);
    if (pin === head.repeat(PIN_LENGTH / block)) return true;
  }

  // A straight run in either direction: 123456, 654321, 456789.
  const ascending = [...pin].every(
    (digit, index) => index === 0 || Number(digit) === Number(pin[index - 1]) + 1,
  );
  const descending = [...pin].every(
    (digit, index) => index === 0 || Number(digit) === Number(pin[index - 1]) - 1,
  );
  if (ascending || descending) return true;

  return false;
}

export type PinProblem = "FORMAT" | "WEAK" | null;

export function checkPin(pin: string): PinProblem {
  if (!isValidPinFormat(pin)) return "FORMAT";
  if (isWeakPin(pin)) return "WEAK";
  return null;
}

export const PIN_FORMAT_MESSAGE = `PIN must be exactly ${PIN_LENGTH} digits.`;
export const PIN_WEAK_MESSAGE =
  "That PIN is too easy to guess — avoid repeated digits and runs like 123456. Pick something less obvious.";
