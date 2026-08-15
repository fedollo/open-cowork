import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class FolderPickerUnsupportedError extends Error {
  constructor(message = "Native folder picker is not supported on this platform") {
    super(message);
    this.name = "FolderPickerUnsupportedError";
  }
}

function isUserCancelled(err: unknown): boolean {
  const stderr =
    typeof err === "object" && err && "stderr" in err
      ? String((err as { stderr?: Buffer | string }).stderr ?? "")
      : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    stderr.includes("User canceled") ||
    stderr.includes("cancelled") ||
    message.includes("User canceled") ||
    message.includes("exit code 1")
  );
}

async function pickOnDarwin(): Promise<string | null> {
  const script =
    'POSIX path of (choose folder with prompt "Select workspace folder")';
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 120_000,
    });
    return stdout.trim() || null;
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

async function pickOnLinux(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "zenity",
      ["--file-selection", "--directory", "--title=Select workspace folder"],
      { timeout: 120_000 },
    );
    return stdout.trim() || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FolderPickerUnsupportedError(
        "Install zenity for native folder picking on Linux",
      );
    }
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

async function pickOnWindows(): Promise<string | null> {
  const command =
    "Add-Type -AssemblyName System.Windows.Forms; " +
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; " +
    "$dialog.Description = 'Select workspace folder'; " +
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { " +
    "Write-Output $dialog.SelectedPath }";
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-STA", "-Command", command],
      { timeout: 120_000 },
    );
    return stdout.trim() || null;
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

/** Opens a native folder picker. Returns null when cancelled. */
export async function pickFolderNative(): Promise<string | null> {
  const plt = platform();
  let picked: string | null;
  if (plt === "darwin") picked = await pickOnDarwin();
  else if (plt === "linux") picked = await pickOnLinux();
  else if (plt === "win32") picked = await pickOnWindows();
  else throw new FolderPickerUnsupportedError();

  if (!picked) return null;
  const st = await stat(picked).catch(() => null);
  if (!st?.isDirectory()) return null;
  return picked;
}
