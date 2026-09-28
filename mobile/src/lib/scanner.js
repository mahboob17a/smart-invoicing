// Document scanning with automatic edge detection and perspective correction.
//
// Uses the phone's built-in document scanner: Google ML Kit Document Scanner on
// Android, Apple VisionKit on iOS. Both find the bill's edges live, crop it,
// straighten it, and support several pages.
//
// These are native modules, so they are NOT inside Expo Go. They work in the
// Smart Invoicing development build (see README, "Build the app with the
// scanner"). In Expo Go, scannerAvailable() is false and the Capture screen
// falls back to the normal camera.
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

export function scannerAvailable() {
  if (Platform.OS === "web") return false;
  try {
    return !!(TurboModuleRegistry.get?.("DocumentScanner") || NativeModules.DocumentScanner);
  } catch {
    return false;
  }
}

/** Opens the scanner. Returns an array of image URIs (one per page), or [] if cancelled. */
export async function scanPages(maxPages = 5) {
  // Required lazily: loading the module in Expo Go would throw.
  const DocumentScanner = require("react-native-document-scanner-plugin").default;
  const res = await DocumentScanner.scanDocument({ maxNumDocuments: maxPages, croppedImageQuality: 90 });
  if (res?.status === "cancel" || !res?.scannedImages?.length) return [];
  return res.scannedImages.map((p) => (p.startsWith("file://") || p.startsWith("content://") || p.startsWith("ph://") ? p : `file://${p}`));
}
