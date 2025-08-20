const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  MenuItem,
} = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "MiniLoom",
    icon: path.join(__dirname, "assets/minihf_logo_no_text.png"),
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Get the existing menu template
  const existingMenuTemplate = Menu.getApplicationMenu().items.map(item => {
    return {
      label: item.label,
      submenu: item.submenu.items,
    };
  });

  // Define new items for the File menu
  const fileMenuItems = [
    {
      label: "Save",
      accelerator: "CmdOrCtrl+S",
      click() {
        mainWindow.webContents.send("invoke-action", "save-file");
      },
    },
    {
      label: "Load",
      accelerator: "CmdOrCtrl+O",
      click() {
        mainWindow.webContents.send("invoke-action", "load-file");
      },
    },
    { type: "separator" }, // Separator
  ];

  // Find the File menu in the existing template
  const fileMenuIndex = existingMenuTemplate.findIndex(
    item => item.label === "File"
  );

  if (fileMenuIndex >= 0) {
    // If File menu exists, append new items to it
    existingMenuTemplate[fileMenuIndex].submenu = fileMenuItems.concat(
      existingMenuTemplate[fileMenuIndex].submenu
    );
  } else {
    // If File menu doesn't exist, add it
    existingMenuTemplate.unshift({
      label: "File",
      submenu: fileMenuItems,
    });
  }

  const editMenuItems = [
    {
      label: "Settings",
      accelerator: "CmdOrCtrl+P",
      click: openSettingsWindow,
    },
  ];

  const editMenuIndex = existingMenuTemplate.findIndex(
    item => item.label === "Edit"
  );

  if (editMenuIndex >= 0) {
    existingMenuTemplate[editMenuIndex].submenu = [
      ...existingMenuTemplate[editMenuIndex].submenu,
      { type: "separator" },
      ...editMenuItems,
    ];
  }

  // Build and set the new menu
  const newMenu = Menu.buildFromTemplate(existingMenuTemplate);
  Menu.setApplicationMenu(newMenu);

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

function openSettingsWindow() {
  const modal = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modal.loadFile("settings.html");
  modal.once("ready-to-show", () => modal.show());

  modal.on("closed", () => {
    // Inform the main window to refresh its UI
    mainWindow.webContents.send("settings-updated");
  });
}

// Listen for open-settings request
ipcMain.handle("open-settings", openSettingsWindow);

let autoSavePath = null;

ipcMain.handle("save-file", async (event, data) => {
  let filePath;
  if (autoSavePath) {
    filePath = autoSavePath;
  } else {
    const { filePath: chosenPath } = await dialog.showSaveDialog(mainWindow, {
      title: "Save File",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    filePath = chosenPath;
    autoSavePath = chosenPath; // Update auto-save path
  }

  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data));
  }
});

ipcMain.handle("load-file", async event => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Load File",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (filePaths && filePaths.length > 0) {
    const content = fs.readFileSync(filePaths[0], "utf8");
    autoSavePath = filePaths[0]; // Update auto-save path
    return JSON.parse(content);
  }
});

ipcMain.handle("load-settings", async event => {
  const miniLoomSettingsFilePath = path.join(
    app.getPath("appData"),
    "miniloom",
    "settings.json"
  );
  let settings;
  if (fs.existsSync(miniLoomSettingsFilePath)) {
    settings = fs.readFileSync(miniLoomSettingsFilePath, "utf8");
    return JSON.parse(settings);
  }
});

// Change this so it no longer saves settings
ipcMain.handle("auto-save", (event, data) => {
  const userFileData = {};
  userFileData["loomTree"] = data["loomTree"];
  userFileData["focus"] = data["focus"];
  if (autoSavePath) {
    fs.writeFileSync(autoSavePath, JSON.stringify(userFileData));
  }
});

ipcMain.handle("save-settings", (event, miniLoomSettings) => {
  const appDataPath = app.getPath("appData");
  const miniLoomSettingsDir = path.join(appDataPath, "miniloom");
  const miniLoomSettingsFilePath = path.join(
    miniLoomSettingsDir,
    "settings.json"
  );
  if (!fs.existsSync(miniLoomSettingsDir)) {
    fs.mkdirSync(miniLoomSettingsDir);
  }
  fs.writeFileSync(miniLoomSettingsFilePath, JSON.stringify(miniLoomSettings));
});

app
  .whenReady()
  .then(() => {
    app.setName("MiniLoom");
    if (process.platform === "darwin") {
      app.dock.setIcon(path.join(__dirname, "assets/minihf_logo_no_text.png"));
    }
  })
  .then(createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});

ipcMain.on("show-context-menu", event => {
  const contextMenu = Menu.buildFromTemplate([
    { label: "Cut", role: "cut" },
    { label: "Copy", role: "copy" },
    { label: "Paste", role: "paste" },
    { type: "separator" },
    { label: "Select All", role: "selectAll" },
  ]);

  contextMenu.popup(BrowserWindow.fromWebContents(event.sender));
});
