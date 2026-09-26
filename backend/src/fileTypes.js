// Identifies uploaded files by their leading bytes. The mime type a client
// declares is never trusted on its own — a renamed .exe must not be stored
// as a "logo" or sent to the extraction service as a "bill".

const TYPES = [
  { mimeType: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mimeType: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
];

/** Returns { mimeType, ext } for a supported file, or null. */
function sniffFileType(buffer) {
  const match = TYPES.find((t) => t.magic.every((byte, i) => buffer[i] === byte));
  return match ? { mimeType: match.mimeType, ext: match.ext } : null;
}

module.exports = { sniffFileType };
