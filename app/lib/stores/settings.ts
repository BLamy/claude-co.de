import { map, type WritableAtom, atom } from 'nanostores';
import { workbenchStore } from './workbench';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
}

export interface Shortcuts {
  toggleTerminal: Shortcut;
}

export interface WebContainerCORSProxyConfig {
  address: string;
  domains: string[];
}

export interface ProxySettings {
  corsAuthToken: string;
  corsProxy: WebContainerCORSProxyConfig;
}

export interface Settings {
  shortcuts: Shortcuts;
  proxy: ProxySettings;
}

const DEFAULT_CORS_PROXY_ADDRESS = typeof window !== 'undefined' ? window.location.origin + '/api' : '/api';
const DEFAULT_CORS_AUTH_TOKEN = '1234567890';

export const shortcutsStore = map<Shortcuts>({
  toggleTerminal: {
    key: 'j',
    ctrlOrMetaKey: true,
    action: () => workbenchStore.toggleTerminal(),
  },
});

export const proxySettingsStore = map<ProxySettings>({
  corsAuthToken: DEFAULT_CORS_AUTH_TOKEN,
  corsProxy: {
    address: DEFAULT_CORS_PROXY_ADDRESS,
    domains: [],
  },
});

export const settingsStore = map<Settings>({
  shortcuts: shortcutsStore.get(),
  proxy: proxySettingsStore.get(),
});

shortcutsStore.subscribe((shortcuts) => {
  settingsStore.set({
    ...settingsStore.get(),
    shortcuts,
  });
});

proxySettingsStore.subscribe((proxy) => {
  settingsStore.set({
    ...settingsStore.get(),
    proxy,
  });
});

export function setCorsAuthToken(token: string) {
  proxySettingsStore.setKey('corsAuthToken', token);
}

export function setCorsProxyAddress(address: string) {
  proxySettingsStore.setKey('corsProxy', {
    ...proxySettingsStore.get().corsProxy,
    address,
  });
}

export function setCorsProxyDomains(domains: string[]) {
  proxySettingsStore.setKey('corsProxy', {
    ...proxySettingsStore.get().corsProxy,
    domains,
  });
}
