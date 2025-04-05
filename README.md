# Yazi for VSCode

Native integration of Yazi directly in a VSCode window (not an integrated terminal)

## Features

- Toggle Yazi in the full-screen editor within VSCode
- Use a keyboard shortcut to quickly open or close Yazi

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the extension:
   ```
   npm run compile
   ```
4. Package the extension:
   ```
   npm install -g @vscode/vsce
   vsce package
   ```
5. Install from VSIX:
   - In VS Code, go to Extensions view
   - Click "..." menu (top-right) → "Install from VSIX..."
   - Select the generated .vsix file

## Requirements

- Yazi must be installed on your system and accessible in your PATH (or set with `yazi-vscode.yaziPath`). You can find installation instructions for Yazi [here](https://github.com/sxyazi/yazi#installation).

## Usage

### Basic Usage

- Use the keyboard shortcut `Ctrl+Shift+Y` (or `Cmd+Shift+Y` on macOS) to toggle Yazi
- When opened, Yazi will focus on your currently active file
- Toggle again to return to your editor

### Commands

- `yazi-vscode.toggle`: Toggle Yazi visibility

### Navigation Tips

- Use Yazi's built-in keybindings for file navigation
- Press `q` to exit Yazi and return to the editor
- Press `Enter` to open a file in VS Code

## More info

- [Yazi](https://github.com/sxyazi/yazi) - Terminal file manager