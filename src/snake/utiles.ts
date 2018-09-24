const parseStringToJson = (data) => {
  try {
    if (data) {
      return JSON.parse(data);
    }
  } catch (exception) {
    console.error("ek-utilities parseStringToJson ex=", exception);
  }
  return undefined;
};

const cloneObject = (obj: any) => {
  let result = null;
  try {
    result = JSON.parse(JSON.stringify(obj));
  } catch (ex) {
    console.error("ek-utilities cloneObject ex=", ex);
  }
  return result;
};

export const objectUtils = {
  parseStringToJson,
  cloneObject
};
