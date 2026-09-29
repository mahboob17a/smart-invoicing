// Downloads a file from the backend (signed in) and opens the phone's share
// sheet, so the user can open it in Word, save it, or send it.
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_BASE_URL, getToken, PDF_TYPE } from "../api/client";

// iOS needs the file's type identifier for the right "Open in…" apps.
const UTI = { [PDF_TYPE]: "com.adobe.pdf" };

export async function downloadAndShare(path, filename, mimeType) {
  const token = await getToken();
  const url = `${API_BASE_URL}${path}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  if (Platform.OS === "web") {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Download failed (${res.status})`);
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    return;
  }

  let file;
  try {
    file = await File.downloadFileAsync(url, new File(Paths.cache, filename), { headers, idempotent: true });
  } catch (e) {
    // The server explains refusals (e.g. "PDF needs LibreOffice") in JSON; show that when we can get it.
    const res = await fetch(url, { headers }).catch(() => null);
    const body = res && !res.ok ? await res.json().catch(() => null) : null;
    throw new Error(body?.error || `Couldn't download the file from ${API_BASE_URL}. Check the backend is running.`);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: UTI[mimeType] || "org.openxmlformats.wordprocessingml.document" });
}
