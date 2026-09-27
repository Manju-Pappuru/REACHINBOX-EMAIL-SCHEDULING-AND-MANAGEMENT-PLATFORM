import { redisConnection } from '../config/redis.js';

const RESERVE_EMAIL_SLOT_SCRIPT = `
local sentCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local nextAllowedAt = tonumber(redis.call('GET', KEYS[2]) or '0')
local now = tonumber(ARGV[1])
local nextHourAt = tonumber(ARGV[2])
local hourlyLimit = tonumber(ARGV[3])
local minimumDelayMs = tonumber(ARGV[4])

if sentCount >= hourlyLimit then
  return {0, nextHourAt, 1}
end

if nextAllowedAt > now then
  return {0, nextAllowedAt, 0}
end

redis.call('INCR', KEYS[1])
redis.call('PEXPIREAT', KEYS[1], nextHourAt)

local reservedNextAllowedAt = now + minimumDelayMs
redis.call('SET', KEYS[2], reservedNextAllowedAt, 'PXAT', math.max(reservedNextAllowedAt, now + 1))

return {1, 0, 0}
`;

export type EmailSlotReservation =
  | { allowed: true }
  | { allowed: false; retryAt: Date; isHourlyLimit: boolean };

export function getHourWindow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}-${hour}`;
}

export function getNextHour(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours() + 1,
  ));
}

function positiveEnvironmentNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function getMaximumEmailsPerHour(): number {
  return positiveEnvironmentNumber('MAX_EMAILS_PER_HOUR_PER_SENDER', 200);
}

export function getMinimumEmailDelayMs(): number {
  return positiveEnvironmentNumber('DEFAULT_EMAIL_DELAY_MS', 2_000);
}

export async function reserveEmailSlot(
  senderId: string,
  hourlyLimit: number,
): Promise<EmailSlotReservation> {
  const now = new Date();
  const nextHour = getNextHour(now);
  const rateKey = `email-rate:${senderId}:${getHourWindow(now)}`;
  const spacingKey = `email-rate-next-send:${senderId}`;
  const result = (await redisConnection.eval(
    RESERVE_EMAIL_SLOT_SCRIPT,
    2,
    rateKey,
    spacingKey,
    now.getTime(),
    nextHour.getTime(),
    hourlyLimit,
    getMinimumEmailDelayMs(),
  )) as [number, number, number];

  const [allowed, retryAtMs, isHourly] = result;
  return allowed === 1
    ? { allowed: true }
    : { allowed: false, retryAt: new Date(retryAtMs), isHourlyLimit: isHourly === 1 };
}
