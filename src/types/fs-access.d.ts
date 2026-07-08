// File System Access API — Chromium-specifika delar som saknas i lib.dom.
// Feature-detekteras alltid via supportsFileSystem() innan användning.

interface FilePickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: FilePickerType[];
  }): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: {
    types?: FilePickerType[];
    multiple?: boolean;
  }): Promise<FileSystemFileHandle[]>;
}

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
