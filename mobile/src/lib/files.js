// Downloads a file from the backend (signed in) and opens the phone's share
// sheet, so the user can open it in Word, save it, or send it.
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { API_BASE_URL, getToken } from "../api/client";

export async function downloadAndShare(path, filename, mimeType) {
  const token = await getToken();
  const url = `${API_BASE_URL}${path}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  if (Platform.OS === "web") {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
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
  } catch {
    throw new Error(`Couldn't download the file from ${API_BASE_URL}. Check the backend is running.`);
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: "org.openxmlformats.wordprocessingml.document" });
}
