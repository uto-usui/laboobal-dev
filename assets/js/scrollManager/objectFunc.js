/**
 * Assigns default values for all properties in an object that are undefined.
 *
 * @param obj {Object}
 * @param defs {Object}
 * @return {Object}
 */
export const defaults = (obj, ...defs) =>
  Object.assign({}, obj, ...defs.reverse(), obj)

/**
 * Creates a new object from the combination of two or more objects.
 *
 * @param objs {Object}
 * @return {Object}
 */
export const merge = (...objs) =>
  [...objs].reduce(
    (acc, obj) =>
      Object.keys(obj).reduce((a, k) => {
        acc[k] = acc.hasOwnProperty(k)
          ? [].concat(acc[k]).concat(obj[k])
          : obj[k]
        return acc
      }, {}),
    {},
  )
