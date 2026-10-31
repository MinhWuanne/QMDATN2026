
const fs = require("node:fs");
const path = require("node:path");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function renderEmailTemplate(templateName, variables) {
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "emails",
    templateName
  );

  const template = fs.readFileSync(templatePath, "utf8");

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      throw new Error(`Missing email template variable: ${key}`);
    }

    return escapeHtml(variables[key]);
  });
}

module.exports = {
  renderEmailTemplate,
};
