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
   * Removes all items
   */
  clear() {
    this.stack = [];
  }

  /**
   * Returns the number of items in the stack
   * @returns {number}
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
   * @param {number} [to] If negative, remove the item at the top of the stack only. Otherwise, remove items from the
   * top of the stack until its length is equal to the specified value.
   * @returns {*} The last item removed from the stack
   */
  pop(to = -1) {
    const { stack } = this;
    if (!stack.length) throw new Error('out of range');
    if (to < 0) return stack.pop();
    if (to >= stack.length) throw new Error('out of range');
    return stack.splice(to)[0];
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
