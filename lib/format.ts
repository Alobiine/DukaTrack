export const money = (v: number) =>
  "UGX " + Math.round(v).toLocaleString("en-UG");
export const day = (t: number) =>
  new Date(t).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
export const nowDay = () => day(Date.now());
export const stamp = (t: number) =>
  new Date(t).toLocaleString("en-UG", {
    timeZone: "Africa/Kampala",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
