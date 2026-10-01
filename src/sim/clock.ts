/** Game clock. 1 real second = `rate` game minutes (default 1 → a 24-minute day). */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class GameClock {
  /** Minutes since the start of day 0 (a Monday at 00:00). */
  minutes: number;
  rate = 1;
  paused = false;

  constructor(startMinutes = 8 * 60 + 30) {
    this.minutes = startMinutes;
  }

  advance(realSeconds: number): void {
    if (!this.paused) this.minutes += realSeconds * this.rate;
  }

  skip(gameMinutes: number): void {
    this.minutes += gameMinutes;
  }

  get day(): number {
    return Math.floor(this.minutes / 1440);
  }

  /** Hour of day as a float in [0, 24). */
  get hour(): number {
    return (((this.minutes % 1440) + 1440) % 1440) / 60;
  }

  get weekday(): string {
    return DAY_NAMES[(this.day + 1) % 7]!;
  }

  format(): string {
    const total = Math.floor(((this.minutes % 1440) + 1440) % 1440 + 1e-6);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const h12 = ((h + 11) % 12) + 1;
    return `${this.weekday.slice(0, 3)} ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
}
