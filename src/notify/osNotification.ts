import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { activatePending, stashPendingActivation } from '../ipc/commands';
import type { NotifyKind } from './notifyStore';

let activationRegistration: Promise<unknown> | null = null;
/** Register (once) the handler that fires when the user clicks a banner:
 *  ask Rust to focus the window and emit notify:activate for the deep-link.
 *  Resets on failure so a future call can retry (guards against cold-start
 *  rejection when the plugin isn't ready yet). */
export function ensureActivationHandler(): void {
  if (activationRegistration) return;
  activationRegistration = onAction(() => { void activatePending(); });
  activationRegistration.catch(() => { activationRegistration = null; });
}

let permissionGranted = false;

// Title carries the action so the banner reads as a verb at a glance; the
// project name goes in the body. macOS already shows the app name ("claui")
// as the banner header, so putting the project name in the title only
// duplicated it (e.g. "claui / claui / Needs your input").
const TITLE: Record<Exclude<NotifyKind, 'done'>, string> = {
  attention: 'Approval needed',
  error: 'Stopped with an error',
};

/** Send a system notification for an actionable event. Best-effort: silently
 *  no-ops if permission is denied. `projectName` becomes the banner body. */
export async function notifyOs(
  projectName: string,
  kind: NotifyKind,
  projectId: string,
  tabId: string,
): Promise<void> {
  if (kind === 'done') return; // belt-and-suspenders: caller already filters done via decideOsNotify
  if (!permissionGranted) {
    permissionGranted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
  }
  if (!permissionGranted) return;
  // Stash the deep-link target BEFORE showing the banner so a fast click
  // (Task 5's handler) always finds it. The command is registered in Task 5;
  // the catch keeps this a harmless no-op until then.
  await stashPendingActivation(projectId, tabId).catch(() => {});
  sendNotification({ title: TITLE[kind], body: projectName });
}
