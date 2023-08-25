const { createHash } = require("node:crypto");

exports.hasCN = (str) => {
  return str && /[\u{4E00}-\u{9FFF}]/gmu.test(str);
};

exports.generateHash = function (char) {
  const hash = createHash("md5");
  hash.update(char);
  return hash.digest("hex").slice();
};
