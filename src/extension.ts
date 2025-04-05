import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as process from "process";
import { exec } from "child_process";

let yaziTerminal: vscode.Terminal | undefined;
// Track the active editor before opening Yazi
let previousActiveFile: vscode.Uri | undefined;

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

    // Create the yazi command
    let yaziCommand = yaziPath;
    
    // Add the active file as an argument to Yazi
    if (activeFilePath) {
      yaziCommand += ` "${activeFilePath}"`;
    }

    // Get the shell path
    let shellPath: string;
    try {
      shellPath = process.platform === "win32" 
        ? "powershell.exe" 
        : await findExecutableOnPath("bash");
    } catch (error) {
      // Fallback to system shell if bash is not found
      shellPath = process.platform === "win32" 
        ? "powershell.exe" 
        : "/bin/sh";
    }

    // Create the terminal
    yaziTerminal = vscode.window.createTerminal({
      name: "Yazi",
      cwd: cwd,
      shellPath: shellPath,
      shellArgs:
        process.platform === "win32"
          ? ["/c", yaziCommand]
          : ["-c", yaziCommand],
      location: vscode.TerminalLocation.Editor
    });

    yaziTerminal.show();

    // Handle terminal close
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === yaziTerminal) {
        yaziTerminal = undefined;
        
        // Focus back on the previously active file
        focusOnPreviousFile();
      }
    });
  } catch (error) {
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
