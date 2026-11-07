const cloudinary = require("../../core/cloudinary");

async function uploadCatalogImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "IMAGE_REQUIRED",
      });
    }

    const folderByType = {
      category: "qmdatn2026/catalog/categories",
      brand: "qmdatn2026/catalog/brands",
      product: "qmdatn2026/catalog/products",
      variant: "qmdatn2026/catalog/variants",
    };

    const folder = folderByType[req.params.type];

    if (!folder) {
      return res.status(400).json({
        success: false,
        message: "INVALID_IMAGE_TYPE",
      });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          allowed_formats: ["jpg", "jpeg", "png", "webp"],
        },
        (error, uploadResult) => {
          if (error) return reject(error);
          resolve(uploadResult);
        }
      );

      stream.end(req.file.buffer);
    });

    return res.status(201).json({
      success: true,
      message: "IMAGE_UPLOADED",
      data: {
        url: result.secure_url,
        publicId: result.public_id,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadCatalogImage,
};