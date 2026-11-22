export const MEETING_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function isValidMeetingCode(value: string): boolean {
  return MEETING_CODE_PATTERN.test(value);
}
