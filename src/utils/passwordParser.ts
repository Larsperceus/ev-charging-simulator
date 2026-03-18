/**
 * Parses the PW-SetChargerPassword value format used by Alfen chargers.
 * The value is "oldPassword<sep>newPassword" where <sep> is the first colon or comma found.
 *
 * Returns `null` when the format is invalid (no separator or empty new password).
 */
export function parsePasswordChangeValue(value: string): { oldPassword: string; newPassword: string } | null {
  const colonIndex = value.indexOf(':');
  const commaIndex = value.indexOf(',');
  const hasColon = colonIndex >= 0;
  const hasComma = commaIndex >= 0;

  const separatorIndex = hasColon && hasComma
    ? Math.min(colonIndex, commaIndex)
    : hasColon
      ? colonIndex
      : commaIndex;

  if (separatorIndex < 0) return null;

  const oldPassword = value.slice(0, separatorIndex);
  const newPassword = value.slice(separatorIndex + 1);

  if (newPassword.trim().length === 0) return null;

  return { oldPassword, newPassword };
}
