import fs from "fs";
import path from "path";

export const color = {
  black: (text: string) => `\x1B[30m${text}\x1B[39m`,
  red: (text: string) => `\x1B[31m${text}\x1B[39m`,
  green: (text: string) => `\x1B[32m${text}\x1B[39m`,
  yellow: (text: string) => `\x1B[33m${text}\x1B[39m`,
  blue: (text: string) => `\x1B[34m${text}\x1B[39m`,
  purple: (text: string) => `\x1B[35m${text}\x1B[39m`,
  cyan: (text: string) => `\x1B[36m${text}\x1B[39m`,
  gray: (text: string) => `\x1B[90m${text}\x1B[39m`,
  hex: (hex: string) => (text: string) =>
    `\x1B[38;2;${hex
      .replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_m, r, g, b) => `#` + r + r + g + g + b + b)
      .substring(1)
      .match(/.{2}/g)!
      .map((x) => parseInt(x, 16))
      .join(";")}m${text}\x1B[39m`
};

export type LogType = "success" | "info" | "warning" | "error";

const TIMEZONE = process.env.TIMEZONE || "Asia/Jakarta";
const LOG_FILE = path.resolve(process.cwd(), "mcp_mikrotik.log");

const stripAnsi = (str: string) =>
  str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");

/**
 * Custom logger with timestamp and colored badges:
 * [ V ] 8/10/2026, 04.30.00 [TAG] Message
 */
export const log = (text: string, type: LogType = "success", date?: Date | number) => {
  let parsedDate = new Date(!date ? Date.now() : date);
  if (isNaN(parsedDate.getTime())) {
    parsedDate = new Date(Date.now());
  }

  const badgeSymbol = type === "error" ? "X" : type === "warning" ? "!" : "V";
  const badgeColor =
    type === "error" ? color.red : type === "warning" ? color.yellow : type === "info" ? color.blue : color.green;

  const timeFormatted = parsedDate.toLocaleString("id-ID", {
    timeZone: TIMEZONE
  });

  const formattedBadge = badgeColor(`[ ${badgeSymbol} ]`);
  const formattedTime = color.hex("#ff7f00")(timeFormatted);

  console.log(formattedBadge, formattedTime, text);

  try {
    const cleanLine = `[ ${badgeSymbol} ] ${timeFormatted} ${stripAnsi(text)}\n`;
    fs.appendFileSync(LOG_FILE, cleanLine, "utf8");
  } catch (e) {}
};
