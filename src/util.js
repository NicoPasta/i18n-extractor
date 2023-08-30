export const hasCN = (str) => {
  return str && /[\u4e00-\u9fa5]+/gmu.test(str);
};
