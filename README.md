# Yazi for VSCode

Native integration of Yazi directly in a VSCode window (not an integrated terminal)
## Features

- Toggle Yazi in the full-screen editor within VSCode
- Use a keyboard shortcut to quickly open or close Yazi
- Navigate and manage your files with Yazi's intuitive interface

### Notes on Windows

Default cmd is ctrl+shift+y which may be captured by the shell. Ensure the following config

```javascript
  "terminal.integrated.sendKeybindingsToShell": false, // ensure this is false
  "terminal.integrated.commandsToSkipShell": ["yazi-vscode.toggle", "workbench.action.closeWindow"], // add this
```

## Requirements

- Yazi must be installed on your system and accessible in your PATH (or set with `yazi-vscode.yaziPath`). You can find installation instructions for Yazi [here](https://github.com/sxyazi/yazi#installation).

## Usage

Use the keyboard shortcut `Ctrl+Shift+y` (or `Cmd+Shift+y` on macOS) to toggle Yazi

- `yazi-vscode.toggle`: Toggle Yazi

## Extension Settings

### Basic Configuration

- `yazi-vscode.yaziPath`: Manually set Yazi path. Otherwise use default system PATH.
- `yazi-vscode.configPath`: Set custom Yazi config. Useful if you like different behaviour between VSCode and CLI.
- `yazi-vscode.autoMaximizeWindow`: Maximize the Yazi window in the editor (keeps sidebar visible). Useful when working with split editors.

### Panel Behavior

You can control how Yazi interacts with VS Code UI panels using the `panels` setting. Each panel can be set to:

- `"keep"`: Leave panel as is (default)
- `"hide"`: Hide the panel when showing Yazi
- `"hideRestore"`: Hide the panel when showing Yazi and restore it when closing

Example configuration:

```json
"yazi-vscode.panels": {
  "sidebar": "hideRestore",
  "panel": "hide",
  "secondarySidebar": "keep"
}
```

#### Available Panels

- `yazi-vscode.panels.sidebar`: Primary sidebar (Explorer, Source Control, etc.)
- `yazi-vscode.panels.panel`: Bottom panel (Terminal, Output, etc.)
- `yazi-vscode.panels.secondarySidebar`: Secondary sidebar (usually on the right side)

> Note: Legacy settings `autoHideSideBar` and `autoHidePanel` are still supported but deprecated.

For settings to be applied, Yazi window must be restarted (`q`).

## More info

> [Yazi](https://github.com/sxyazi/yazi)
