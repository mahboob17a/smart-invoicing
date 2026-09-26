import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

// Every capture path resolves to { uri, name, mimeType } ready for
// api.uploadBill, or null if the user cancelled.

// Phone cameras produce 12+ megapixel photos; the extraction model reads
// at well under 2000px, so resizing first makes uploads fast on site
// connections without losing anything it could use. Re-encoding as JPEG
// also turns iOS HEIC photos into a format the server accepts.
const MAX_EDGE = 2000;

async function prepareImage(asset) {
  let { width, height } = asset;
  if (!width || !height) {
    // Files-app picks don't report dimensions; a no-op pass reads them.
    ({ width, height } = await manipulateAsync(asset.uri, []));
  }
  const actions =
    Math.max(width, height) > MAX_EDGE
      ? [{ resize: width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
      : [];
  const result = await manipulateAsync(asset.uri, actions, {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  return { uri: result.uri, name: "bill.jpg", mimeType: "image/jpeg" };
}

export class PermissionDeniedError extends Error {}

export async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new PermissionDeniedError("Camera access is off. Turn it on in Settings to photograph bills.");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  return result.canceled ? null : prepareImage(result.assets[0]);
}

export async function choosePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
  });
  return result.canceled ? null : prepareImage(result.assets[0]);
}

// PDFs are uploaded as-is; images picked through Files go through the
// same resize as photos.
export async function chooseFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (file.mimeType === "application/pdf") {
    return { uri: file.uri, name: file.name || "bill.pdf", mimeType: "application/pdf" };
  }
  return prepareImage({ uri: file.uri });
}
