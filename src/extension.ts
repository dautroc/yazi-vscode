import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as process from "process";
import { exec } from "child_process";

let yaziTerminal: vscode.Terminal | undefined;
// Track the active editor before opening Yazi
let previousActiveFile: vscode.Uri | undefined;
// Track the chooser file path for the active Yazi instance
let yaziChooserFilePath: string | undefined;

/* --- Events --- */

export async function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "yazi-vscode.toggle",
    async () => {
      if (yaziTerminal) {
        if (isYaziTerminalFocused()) {
          closeYaziTerminal();
        } else {
          // Always restart Yazi to ensure it focuses on current active file
          yaziTerminal.dispose();
          yaziTerminal = undefined;
          await openYaziTerminal();
        }
      } else {
        await openYaziTerminal();
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

/* --- Terminal Management --- */

async function openYaziTerminal() {
  // Prevent opening multiple instances if one is already initializing or present
  if (yaziTerminal) {
     // If it exists but isn't focused, the toggle logic might re-trigger this.
     // For now, let the existing toggle logic handle disposal/recreation.
     // Alternatively, we could just .show() it, but respecting original intent for now.
     console.log("Yazi terminal already exists or is being created.");
     // If just showing: yaziTerminal.show(); return;
     // If respecting toggle logic: Let the command handle disposal. We might enter here briefly if called rapidly.
     return; 
  }

  try {
    // Save the current active editor before opening Yazi
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      previousActiveFile = activeEditor.document.uri;
    }
    
    // Get the Yazi path
    const yaziPath = await findYaziExecutable();
    
    // Get the directory of the active file if available
    let cwd = os.homedir();
    let activeFilePath = "";
    
    // Check for active editor first
    if (activeEditor) {
      const filePath = activeEditor.document.uri.fsPath;
      // Get the directory containing the file
      if (filePath) {
        cwd = path.dirname(filePath);
        activeFilePath = filePath;
      }
    } 
    // Fallback to workspace folder if no active file
    else if (vscode.workspace.workspaceFolders?.length) {
      cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    // 1. Generate Temp File Path
    const tmpDir = os.tmpdir();
    const uniqueSuffix = `${Date.now()}-${process.pid}`; // Basic unique identifier
    // Clear any previous path just in case
    yaziChooserFilePath = undefined; 
    const currentChooserFilePath = path.join(tmpDir, `yazi-vscode-chooser-${uniqueSuffix}.tmp`);

    // Create the yazi arguments
    const yaziProcessArgs: string[] = [];
    if (activeFilePath) {
      yaziProcessArgs.push(activeFilePath);
    }
    yaziProcessArgs.push("--chooser-file");
    yaziProcessArgs.push(currentChooserFilePath);

    // Create the terminal
    yaziTerminal = vscode.window.createTerminal({
      name: "Yazi",
      shellPath: yaziPath, // Use yazi executable directly as shellPath
      shellArgs: yaziProcessArgs, // Pass arguments directly
      cwd: cwd,
      location: vscode.TerminalLocation.Editor,
    });

    // Assign the chooser path *after* successfully creating the terminal
    // This instance will use currentChooserFilePath
    yaziChooserFilePath = currentChooserFilePath; 

    yaziTerminal.show();

    // Handle terminal close
    // Capture the path for this specific terminal instance closure
    const closeSubscription = vscode.window.onDidCloseTerminal(async (terminal) => {
      // Ensure we are handling the closure of the correct Yazi terminal instance
      if (terminal === yaziTerminal) {
        let openedFileFromYazi = false;
        const associatedChooserPath = yaziChooserFilePath; // Read the path associated at the time of closure setup

        // Check if the chooser file exists and process it
        if (associatedChooserPath && fs.existsSync(associatedChooserPath)) {
          let chosenFilePath = '';
          try {
            chosenFilePath = fs.readFileSync(associatedChooserPath, "utf8").trim();
            // Clean up immediately after reading
            try { fs.unlinkSync(associatedChooserPath); } catch (unlinkErr) { /* ignore */ } 

            if (chosenFilePath) {
              const fileUri = vscode.Uri.file(chosenFilePath);
              try {
                const doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc, { preview: false });
                openedFileFromYazi = true; // Mark success
              } catch (openErr) {
                console.error(`Error opening file selected from Yazi: ${openErr}`);
                vscode.window.showErrorMessage(`Failed to open: ${chosenFilePath}`);
              }
            }
          } catch (err) {
            console.error(`Error processing Yazi chooser file: ${err}`);
            vscode.window.showWarningMessage(`Could not process file path from Yazi.`);
            // Attempt cleanup even if reading failed
            try {
              if (fs.existsSync(associatedChooserPath)) {
                fs.unlinkSync(associatedChooserPath);
              }
            } catch (unlinkErr) { /* ignore */ }
          }
        }

        // Reset terminal state associated with this instance
        yaziTerminal = undefined;
        // Important: Only clear the global yaziChooserFilePath if it *still* matches the one from this instance.
        // This avoids race conditions if a new terminal was opened very quickly.
        if (yaziChooserFilePath === associatedChooserPath) {
            yaziChooserFilePath = undefined;
        }

        // Focus on the previous file ONLY if Yazi didn't open a new one
        if (!openedFileFromYazi) {
          focusOnPreviousFile();
        }

        // Dispose the listener associated with *this* terminal instance closure
        closeSubscription.dispose();
      }
    });
  } catch (error) {
    // Reset terminal state on error too
    yaziTerminal = undefined; 
    yaziChooserFilePath = undefined;
    vscode.window.showErrorMessage(`Failed to open Yazi: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Focus back on the previously active file
function focusOnPreviousFile() {
  if (previousActiveFile) {
    vscode.workspace.openTextDocument(previousActiveFile)
      .then(doc => {
        vscode.window.showTextDocument(doc, { preview: false });
      })
      .then(undefined, () => {
        // File might have been closed or deleted, just ignore
      });
  }
}

async function findYaziExecutable(): Promise<string> {
  // First check user configuration
  const config = vscode.workspace.getConfiguration("yazi-vscode");
  let configPath = config.get<string>("yaziPath", "");
  
  if (configPath) {
    configPath = expandPath(configPath);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  
  // Then try to find on PATH
  try {
    const yaziPath = await findExecutableOnPath("yazi");
    return yaziPath;
  } catch (error) {
    throw new Error("Yazi not found in PATH. Please install Yazi or set the path in settings.");
  }
}

function isYaziTerminalFocused(): boolean {
  return (
    vscode.window.activeTextEditor === undefined &&
    vscode.window.activeTerminal === yaziTerminal
  );
}

function closeYaziTerminal() {
  const openTabs = vscode.window.tabGroups.all.flatMap(
    (group) => group.tabs
  ).length;
  if (openTabs === 1 && yaziTerminal) {
    // only yazi tab, close
    yaziTerminal.dispose();
  } else {
    // toggle recently used tab in group
    vscode.commands.executeCommand(
      "workbench.action.openPreviousRecentlyUsedEditorInGroup"
    );
  }
}

function findExecutableOnPath(executable: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      process.platform === "win32" ? `where ${executable}` : `which ${executable}`,
      (error, stdout) => {
        if (error) {
          reject(new Error(`${executable} not found on PATH`));
        } else {
          resolve(stdout.trim().split("\n")[0]);
        }
      }
    );
  });
}

function expandPath(pth: string): string {
  if (pth.startsWith("~")) {
    return path.join(os.homedir(), pth.slice(1));
  }
  return pth;
}
