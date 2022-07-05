/**
 * A stack with some extra error handling. Items stored in the stack can have any type.
 */
class Stack {
  /**
   * @constructor
   */
  constructor() {
    this.stack = [];
  }

  /**
   * Removes all items. This is the same as `pop(0)`.
   */
  clear() {
    this.stack = [];
  }

  /**
   * @property {number}
   * Returns the number of items in the stack
   * @type {number}
   */
  get length() {
    return this.stack.length;
  }

  /**
   * Adds an item to the top of the stack
   * @param {*} item
   * @returns {number} The new length of the stack
   */
  push(item) {
    return this.stack.push(item);
  }

  /**
   * Removes items from the top of the stack
   * @param {number} [toLength] If negative, remove the item at the top of the stack only. Otherwise, remove items from
   * the top of the stack until its length is equal to the specified value.
   * @returns {*} The last item removed from the stack
   */
  pop(toLength = -1) {
    const { stack } = this;
    if (!stack.length) throw new Error('out of range');
    if (toLength < 0) return stack.pop();
    if (toLength >= stack.length) throw new Error('out of range');
    return stack.splice(toLength)[0];
  }

  /**
   * Returns an item relative to the top of the stack
   * @param {number} [offset] An index relative to the top of the stack. 0 for the top of the stack; 1 for the item
   * below the top of the stack; 2 for the second item below the top of the stack; etc..
   * @returns {*}
   */
  top(offset = 0) {
    const { stack } = this;
    const { length } = stack;
    if (offset < 0 || offset >= length) throw new Error('out of range');
    return stack[length - offset - 1];
  }

  /**
   * Returns an item relative to the bottom of the stack
   * @param {number} [offset] An index relative to the bottom of the stack. 0 for the bottom of the stack; 1 for the
   * item above the bottom of the stack; 2 for the second item above the bottom of the stack; etc..
   * @returns {*}
   */
  bottom(offset = 0) {
    const { stack } = this;
    const { length } = stack;
    if (offset < 0 || offset >= length) throw new Error('out of range');
    return stack[offset];
  }
}

module.exports = Stack;
