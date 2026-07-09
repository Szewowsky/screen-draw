import { contextBridge, ipcRenderer } from "electron";
import type { NativeThemeInfo, ThemeSource } from "../main/services/theme";

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
    getInfo: (): Promise<NativeThemeInfo> => ipcRenderer.invoke("nativeTheme:getInfo"),
    setThemeSource: (source: ThemeSource): Promise<boolean> =>
      ipcRenderer.invoke("nativeTheme:setThemeSource", source),
  },
};

contextBridge.exposeInMainWorld("screenDraw", screenDrawAPI);

export type ScreenDrawAPI = typeof screenDrawAPI;
