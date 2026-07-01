import { contextBridge, ipcRenderer } from "electron";

type IpcListener = (params: unknown) => void;

const screenDrawAPI = {
  ipc: {
    invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
      ipcRenderer.invoke(channel, ...args),
    send: (channel: string, ...args: unknown[]): void => ipcRenderer.send(channel, ...args),
    on: (channel: string, callback: IpcListener): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, params: unknown) => callback(params);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  nativeTheme: {
    getInfo: (): Promise<{
      themeSource: "system" | "light" | "dark";
      shouldUseDarkColors: boolean;
    }> => ipcRenderer.invoke("nativeTheme:getInfo"),
    setThemeSource: (source: "system" | "light" | "dark"): Promise<boolean> =>
      ipcRenderer.invoke("nativeTheme:setThemeSource", source),
  },
};

contextBridge.exposeInMainWorld("screenDraw", screenDrawAPI);

export type ScreenDrawAPI = typeof screenDrawAPI;
