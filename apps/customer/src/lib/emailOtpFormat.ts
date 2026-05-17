/**
 * Supabase email OTP / magic-link numeric tokens are often 6 or 8 digits depending on project config.
 */
export const EMAIL_OTP_MIN_DIGITS = 6
export const EMAIL_OTP_MAX_DIGITS = 12

export function normalizeEmailOtpInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, EMAIL_OTP_MAX_DIGITS)
}

export function isValidEmailOtpDigitCount(digits: string): boolean {
  const n = digits.replace(/\D/g, '').length
  return n >= EMAIL_OTP_MIN_DIGITS && n <= EMAIL_OTP_MAX_DIGITS
}
