import { open } from '@tauri-apps/plugin-dialog';

/**
 * Open the native folder picker. Resolves to the chosen absolute path, or
 * `null` if the user cancelled. Shared by ProjectPicker and the
 * `menu:add-project` handler in App.tsx.
 */
export async function pickProjectFolder(): Promise<string | null> {
  const folder = await open({
    directory: true,
    multiple: false,
    title: 'Select a project folder',
  });
  return typeof folder === 'string' ? folder : null;
}
