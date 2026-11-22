import type { IncomingHttpHeaders } from "node:http";

export function getHostCookieName(meetingCode: string): string {
  return `huddilo_host_${meetingCode.replace(/-/g, "_")}`;
}

export function getCookieValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const cookies = headers.cookie?.split(";") ?? [];
  const item = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));

  return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : undefined;
}
