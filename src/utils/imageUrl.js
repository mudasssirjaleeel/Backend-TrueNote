const buildImageUrl = (req, filename) => {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  return `${req.protocol}://${req.get("host")}/api/uploads/${filename}`;
};

const getUploadedFiles = (req) => {
  if (req.files?.length) return req.files.map((f) => f.filename);
  if (req.file) return [req.file.filename];
  return [];
};

const formatImages = (req, item) => ({
  ...item,
  imageUrl: buildImageUrl(req, item.imageUrl),
  imageUrls: (item.imageUrls || []).map((url) => buildImageUrl(req, url)),
});

module.exports = { buildImageUrl, getUploadedFiles, formatImages };
