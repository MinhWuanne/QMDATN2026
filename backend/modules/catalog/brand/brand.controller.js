const service = require("./brand.service");

async function listBrands(req, res) {
  const result = await service.listBrands(req.query);

  return res.status(200).json({
    success: true,
    ...result,
  });
}

async function getBrand(req, res) {
  const brand = await service.getBrandById(req.params.id);

  return res.status(200).json({
    success: true,
    data: brand,
  });
}

async function createBrand(req, res) {
  const brand = await service.createBrand(req.body);

  return res.status(201).json({
    success: true,
    message: "BRAND_CREATED",
    data: brand,
  });
}

async function updateBrand(req, res) {
  const brand = await service.updateBrand(req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "BRAND_UPDATED",
    data: brand,
  });
}

module.exports = {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
};
