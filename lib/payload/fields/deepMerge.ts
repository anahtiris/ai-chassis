 
// @ts-nocheck

// Minimal recursive object merge — only used by link.ts's `overrides` param,
// which needs to merge a caller-supplied partial field config into the
// generated one without clobbering nested `admin`/`fields` keys.
function isObject(item: unknown): item is Record<string, unknown> {
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

export default function deepMerge<T, R>(target: T, source: R): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}
