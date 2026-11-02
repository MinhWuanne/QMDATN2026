function toSlug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertUuid(id) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id || "")) {
    const error = new Error("VALIDATION_ERROR");
    error.details = [{ field: "id", message: "ID không hợp lệ" }];
    throw error;
  }
}

function parseListQuery(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));

  let isActive;

  if (query.isActive === "true") isActive = true;
  if (query.isActive === "false") isActive = false;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    search: typeof query.search === "string" ? query.search.trim() : "",
    isActive,
  };
}

function handleUniqueError(error, entity) {
  if (error.code === "P2002") {
    throw new Error(`${entity}_SLUG_EXISTS`);
  }

  throw error;
}

module.exports = {
  toSlug,
  assertUuid,
  parseListQuery,
  handleUniqueError,
};
