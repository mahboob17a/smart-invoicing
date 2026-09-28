// Photos straight from a phone camera are often 4000px+ and several MB. The
// AI reads bills just as well at ~1800px, and uploads are far faster.
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX = 1800;

export async function preparePhoto(asset) {
  const { uri, width = 0, height = 0 } = asset;
  const longest = Math.max(width, height);
  const ctx = ImageManipulator.manipulate(uri);
  if (longest > MAX) ctx.resize(width >= height ? { width: MAX } : { height: MAX });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, mimeType: "image/jpeg", name: `bill-${Date.now()}.jpg`, kind: "image" };
}
