const service = require("./category.service");

async function listCategories(req, res) {
  const result = await service.listCategories(req.query);

  return res.status(200).json({
    success: true,
    ...result,
  });
}

async function getCategory(req, res) {
  const category = await service.getCategoryById(req.params.id);

  return res.status(200).json({
    success: true,
    data: category,
  });
}

async function createCategory(req, res) {
  const category = await service.createCategory(req.body);

  return res.status(201).json({
    success: true,
    message: "CATEGORY_CREATED",
    data: category,
  });
}

async function updateCategory(req, res) {
  const category = await service.updateCategory(req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: "CATEGORY_UPDATED",
    data: category,
  });
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
};
