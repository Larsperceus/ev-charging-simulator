export type FirmwareStatus =
  | 'Idle'
  | 'Downloading'
  | 'Downloaded'
  | 'Installing'
  | 'Installed'
  | 'DownloadFailed'
  | 'InstallationFailed';

export type FirmwareFailureStage = 'download' | 'install' | null;

export type FirmwareSchedule = {
  downloadMs: number;
  installMs: number;
};

export type FirmwareJob = {
  location: string;
  retrieveDate: Date;
  schedule?: Partial<FirmwareSchedule>;
  failStage?: FirmwareFailureStage;
  version?: string;
  retries?: number;
  retryIntervalMs?: number;
};

export type FirmwareManagerOptions = {
  schedule: FirmwareSchedule;
  onStatus: (status: Exclude<FirmwareStatus, 'Idle'>) => Promise<void> | void;
  onInstalled: (version: string) => void;
  onVersionResolve: (location: string) => string;
};

export class FirmwareManager {
  private state: FirmwareStatus = 'Idle';
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  private schedule: FirmwareSchedule;

  constructor(private readonly options: FirmwareManagerOptions) {
    this.schedule = { ...options.schedule };
  }

  public getState() {
    return this.state;
  }

  public setSchedule(overrides: Partial<FirmwareSchedule>) {
    this.schedule = { ...this.schedule, ...overrides };
  }

  public start(job: FirmwareJob): boolean {
    if (this.busy) return false;
    this.busy = true;

    const schedule = { ...this.schedule, ...job.schedule };
    const startDelay = Math.max(0, job.retrieveDate.getTime() - Date.now());
    const maxRetries = Number.isInteger(job.retries) && (job.retries as number) > 0 ? (job.retries as number) : 0;
    const retryIntervalMs = Number.isInteger(job.retryIntervalMs) && (job.retryIntervalMs as number) > 0
      ? (job.retryIntervalMs as number)
      : 0;
    let attemptsRemaining = maxRetries + 1;

    const runAttempt = () => {
      this.scheduleTransition(0, 'Downloading', async () => {
        await this.options.onStatus('Downloading');

        this.scheduleTransition(schedule.downloadMs, job.failStage === 'download' ? 'DownloadFailed' : 'Downloaded', async () => {
          if (job.failStage === 'download') {
            await this.options.onStatus('DownloadFailed');
            attemptsRemaining -= 1;
            if (attemptsRemaining > 0) {
              this.scheduleTransition(retryIntervalMs, this.state, runAttempt);
              return;
            }
            this.busy = false;
            return;
          }

          await this.options.onStatus('Downloaded');

          this.scheduleTransition(0, 'Installing', async () => {
            await this.options.onStatus('Installing');

            this.scheduleTransition(schedule.installMs, job.failStage === 'install' ? 'InstallationFailed' : 'Installed', async () => {
              if (job.failStage === 'install') {
                await this.options.onStatus('InstallationFailed');
                attemptsRemaining -= 1;
                if (attemptsRemaining > 0) {
                  this.scheduleTransition(retryIntervalMs, this.state, runAttempt);
                  return;
                }
                this.busy = false;
                return;
              }

              await this.options.onStatus('Installed');
              const version = job.version ?? this.options.onVersionResolve(job.location);
              this.options.onInstalled(version);
              this.busy = false;
            });
          });
        });
      });
    };

    this.clearTimers();
    this.scheduleTransition(startDelay, this.state, runAttempt);

    return true;
  }

  private scheduleTransition(delayMs: number, next: FirmwareStatus, fn: () => Promise<void> | void) {
    const timer = setTimeout(async () => {
      this.state = next;
      await fn();
    }, delayMs);
    this.timers.push(timer);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}