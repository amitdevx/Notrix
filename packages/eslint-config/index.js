module.exports = {
  extends: ["eslint:recommended", "prettier"],
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  }
};
