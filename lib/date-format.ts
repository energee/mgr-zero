const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayHeader = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

export const formatDate = (value: string | Date) => date.format(typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value);
export const formatDayHeader = (value: string | Date) => dayHeader.format(new Date(value));
export const formatDateTime = (value: string | Date, timeZone?: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone,
}).format(new Date(value));
