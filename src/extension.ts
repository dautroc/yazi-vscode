import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as process from "process";
import { exec } from "child_process";
import assert = require("assert");

let yaziTerminal: vscode.Terminal | undefined;
let globalConfig: YaziConfig;
let globalConfigJSON: string;

/* --- Config --- */

type PanelBehavior = "keep" | "hide" | "hideRestore";

interface PanelOptions {
  sidebar: PanelBehavior;
  panel: PanelBehavior;
  secondarySidebar: PanelBehavior;
}

interface YaziConfig {
  yaziPath: string;
  configPath: string;
  autoMaximizeWindow: boolean;
  panels: PanelOptions;
}

function loadConfig(): YaziConfig {
  const config = vscode.workspace.getConfiguration("yazi-vscode");

  // Helper function for getting panel behavior with legacy fallback
  function getPanelBehavior(panelName: string): PanelBehavior {
    const defaultValue = panelName === "secondarySidebar" ? "hide" : "keep";
    const newSetting = config.get<PanelBehavior>(
      `panels.${panelName}`,
      defaultValue
    );
    if (newSetting !== defaultValue) return newSetting;

    // Legacy fallbacks for published settings
    if (panelName === "sidebar") {
      return config.get<boolean>("autoHideSideBar", false) ? "hide" : "keep";
    } else if (panelName === "panel") {
      return config.get<boolean>("autoHidePanel", false) ? "hide" : "keep";
    }

    return defaultValue;
  }

  return {
    yaziPath: config.get<string>("yaziPath", ""),
    configPath: config.get<string>("configPath", ""),
    autoMaximizeWindow: config.get<boolean>("autoMaximizeWindow", false),
    panels: {
      sidebar: getPanelBehavior("sidebar"),
      panel: getPanelBehavior("panel"),
      secondarySidebar: getPanelBehavior("secondarySidebar"),
    },
  };
}

async function reloadIfConfigChange() {
  const currentConfig = loadConfig();
  if (JSON.stringify(currentConfig) !== globalConfigJSON) {
    await loadExtension();
  }
}

async function loadExtension() {
  globalConfig = loadConfig();
  globalConfigJSON = JSON.stringify(globalConfig);

  if (globalConfig.configPath) {
    globalConfig.configPath = expandPath(globalConfig.configPath);
  }

  // Validate yaziPath
  if (globalConfig.yaziPath) {
    globalConfig.yaziPath = expandPath(globalConfig.yaziPath);
  } else {
    try {
      globalConfig.yaziPath = await findExecutableOnPath("yazi");
    } catch (error) {
      vscode.window.showErrorMessage(
        "Yazi not found in config or on PATH. Please check your settings."
      );
    }
  }

  if (!fs.existsSync(globalConfig.yaziPath)) {
    vscode.window.showErrorMessage(
      `Yazi not found at ${globalConfig.yaziPath}. Please check your settings.`
    );
  }

  if (globalConfig.configPath && !fs.existsSync(globalConfig.configPath)) {
    vscode.window.showWarningMessage(
      `Custom config file not found at ${globalConfig.configPath}. The default config will be used.`
    );
    globalConfig.configPath = "";
  }
}

/* --- Events --- */

export async function activate(context: vscode.ExtensionContext) {
  // Initialize configuration on activation
  await loadExtension();

  let disposable = vscode.commands.registerCommand(
    "yazi-vscode.toggle",
    async () => {
      if (yaziTerminal) {
        if (windowFocused()) {
          closeWindow();
          onHide();
        } else {
          focusWindow();
          onShown();
        }
      } else {
        try {
          await createWindow();
          onShown();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open Yazi: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

/* ---  Window --- */

async function createWindow() {
  try {
    await reloadIfConfigChange();

    // Get the directory of the active file if available
    let cwd = os.homedir();
    
    // Check for active editor first
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeFilePath = activeEditor.document.uri.fsPath;
      // Get the directory containing the file
      if (activeFilePath) {
        cwd = path.dirname(activeFilePath);
      }
    } 
    // Fallback to workspace folder if no active file
    else if (vscode.workspace.workspaceFolders?.length) {
      cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    if (!globalConfig.yaziPath) {
      throw new Error("Yazi path is not defined. Please check your settings.");
    }

    let yaziCommand = globalConfig.yaziPath;
    if (globalConfig.configPath) {
      yaziCommand += ` --config-file="${globalConfig.configPath}"`;
    }

    const env: { [key: string]: string } = {};
    try {
      let codePath = await findExecutableOnPath("code");
      env.PATH = `"${codePath}"${path.delimiter}${process.env.PATH}`;
    } catch (error) {
      vscode.window.showWarningMessage(
        "Could not find 'code' on PATH. Opening vscode windows with editor commands may not work properly."
      );
    }

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
      vscode.window.showWarningMessage(
        "Could not find bash. Using system shell as fallback."
      );
    }

    yaziTerminal = vscode.window.createTerminal({
      name: "Yazi",
      cwd: cwd,
      shellPath: shellPath,
      shellArgs:
        process.platform === "win32"
          ? ["/c", yaziCommand]
          : ["-c", yaziCommand],
      location: vscode.TerminalLocation.Editor,
      env: env,
    });

    focusWindow();

    // yazi window closes, unlink and focus on editor (where yazi was)
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === yaziTerminal) {
        yaziTerminal = undefined;
        onHide();
      }
    });
  } catch (error) {
    throw error; // Propagate to toggle command for proper error handling
  }
}

function windowFocused(): boolean {
  return (
    vscode.window.activeTextEditor === undefined &&
    vscode.window.activeTerminal === yaziTerminal
  );
}

function focusWindow() {
  assert(yaziTerminal, "yaziTerminal undefined when trying to show!");
  yaziTerminal.show(false); // false: take focus
}

function closeWindow() {
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

function onShown() {
  const shouldKeep = (behavior: PanelBehavior) => behavior === "keep";
  const shouldHide = (behavior: PanelBehavior) =>
    behavior === "hide" || behavior === "hideRestore";

  if (globalConfig.autoMaximizeWindow) {
    vscode.commands.executeCommand(
      "workbench.action.maximizeEditorHideSidebar"
    );

    // maximizeEditorHideSidebar closes both sidebars. If keep is true, we need to open them again.
    if (shouldKeep(globalConfig.panels.sidebar)) {
      vscode.commands.executeCommand(
        "workbench.action.toggleSidebarVisibility"
      );
    }
    if (shouldKeep(globalConfig.panels.secondarySidebar)) {
      vscode.commands.executeCommand("workbench.action.toggleAuxiliaryBar");
      setTimeout(() => {
        vscode.commands.executeCommand(
          "workbench.action.focusActiveEditorGroup"
        );
      }, 200);
    }
  } else {
    // autoMaximizeWindow: false
    if (shouldHide(globalConfig.panels.sidebar)) {
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    }

    if (shouldHide(globalConfig.panels.secondarySidebar)) {
      vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    }
  }

  // Bottom panel not affected by autoMaximizeWindow
  if (shouldHide(globalConfig.panels.panel)) {
    vscode.commands.executeCommand("workbench.action.closePanel");
  }
}

function onHide() {
  const shouldRestore = (behavior: PanelBehavior) => behavior === "hideRestore";

  if (shouldRestore(globalConfig.panels.sidebar)) {
    vscode.commands.executeCommand("workbench.action.toggleSidebarVisibility");
  }

  if (shouldRestore(globalConfig.panels.panel)) {
    vscode.commands.executeCommand("workbench.action.togglePanel");
  }

  if (shouldRestore(globalConfig.panels.secondarySidebar)) {
    vscode.commands.executeCommand("workbench.action.toggleAuxiliaryBar");
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
