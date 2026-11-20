"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e2) {
      throw mod = 0, e2;
    }
  };
  var __copyProps = (to2, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to2, key) && key !== except)
          __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to2;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "node_modules/base64-js/index.js"(exports) {
      "use strict";
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i2 = 0, len = code.length; i2 < len; ++i2) {
        lookup[i2] = code[i2];
        revLookup[code.charCodeAt(i2)] = i2;
      }
      var i2;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i3;
        for (i3 = 0; i3 < len2; i3 += 4) {
          tmp = revLookup[b64.charCodeAt(i3)] << 18 | revLookup[b64.charCodeAt(i3 + 1)] << 12 | revLookup[b64.charCodeAt(i3 + 2)] << 6 | revLookup[b64.charCodeAt(i3 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i3)] << 2 | revLookup[b64.charCodeAt(i3 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i3)] << 10 | revLookup[b64.charCodeAt(i3 + 1)] << 4 | revLookup[b64.charCodeAt(i3 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i3 = start; i3 < end; i3 += 3) {
          tmp = (uint8[i3] << 16 & 16711680) + (uint8[i3 + 1] << 8 & 65280) + (uint8[i3 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i3 = 0, len22 = len2 - extraBytes; i3 < len22; i3 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i3, i3 + maxChunkLength > len22 ? len22 : i3 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "node_modules/ieee754/index.js"(exports) {
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e2, m2;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i2 = isLE ? nBytes - 1 : 0;
        var d2 = isLE ? -1 : 1;
        var s2 = buffer[offset + i2];
        i2 += d2;
        e2 = s2 & (1 << -nBits) - 1;
        s2 >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e2 = e2 * 256 + buffer[offset + i2], i2 += d2, nBits -= 8) {
        }
        m2 = e2 & (1 << -nBits) - 1;
        e2 >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m2 = m2 * 256 + buffer[offset + i2], i2 += d2, nBits -= 8) {
        }
        if (e2 === 0) {
          e2 = 1 - eBias;
        } else if (e2 === eMax) {
          return m2 ? NaN : (s2 ? -1 : 1) * Infinity;
        } else {
          m2 = m2 + Math.pow(2, mLen);
          e2 = e2 - eBias;
        }
        return (s2 ? -1 : 1) * m2 * Math.pow(2, e2 - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e2, m2, c2;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt2 = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i2 = isLE ? 0 : nBytes - 1;
        var d2 = isLE ? 1 : -1;
        var s2 = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m2 = isNaN(value) ? 1 : 0;
          e2 = eMax;
        } else {
          e2 = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c2 = Math.pow(2, -e2)) < 1) {
            e2--;
            c2 *= 2;
          }
          if (e2 + eBias >= 1) {
            value += rt2 / c2;
          } else {
            value += rt2 * Math.pow(2, 1 - eBias);
          }
          if (value * c2 >= 2) {
            e2++;
            c2 /= 2;
          }
          if (e2 + eBias >= eMax) {
            m2 = 0;
            e2 = eMax;
          } else if (e2 + eBias >= 1) {
            m2 = (value * c2 - 1) * Math.pow(2, mLen);
            e2 = e2 + eBias;
          } else {
            m2 = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e2 = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i2] = m2 & 255, i2 += d2, m2 /= 256, mLen -= 8) {
        }
        e2 = e2 << mLen | m2;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i2] = e2 & 255, i2 += d2, e2 /= 256, eLen -= 8) {
        }
        buffer[offset + i2 - d2] |= s2 * 128;
      };
    }
  });

  // node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "node_modules/buffer/index.js"(exports) {
      "use strict";
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e2) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b2 = fromObject(value);
        if (b2) return b2;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i2 = 0; i2 < length; i2 += 1) {
          buf[i2] = array[i2] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer(b2) {
        return b2 != null && b2._isBuffer === true && b2 !== Buffer3.prototype;
      };
      Buffer3.compare = function compare(a2, b2) {
        if (isInstance(a2, Uint8Array)) a2 = Buffer3.from(a2, a2.offset, a2.byteLength);
        if (isInstance(b2, Uint8Array)) b2 = Buffer3.from(b2, b2.offset, b2.byteLength);
        if (!Buffer3.isBuffer(a2) || !Buffer3.isBuffer(b2)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a2 === b2) return 0;
        let x2 = a2.length;
        let y2 = b2.length;
        for (let i2 = 0, len = Math.min(x2, y2); i2 < len; ++i2) {
          if (a2[i2] !== b2[i2]) {
            x2 = a2[i2];
            y2 = b2[i2];
            break;
          }
        }
        if (x2 < y2) return -1;
        if (y2 < x2) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i2;
        if (length === void 0) {
          length = 0;
          for (i2 = 0; i2 < list.length; ++i2) {
            length += list[i2].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i2 = 0; i2 < list.length; ++i2) {
          let buf = list[i2];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b2, n2, m2) {
        const i2 = b2[n2];
        b2[n2] = b2[m2];
        b2[m2] = i2;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i2 = 0; i2 < len; i2 += 2) {
          swap(this, i2, i2 + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i2 = 0; i2 < len; i2 += 4) {
          swap(this, i2, i2 + 3);
          swap(this, i2 + 1, i2 + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i2 = 0; i2 < len; i2 += 8) {
          swap(this, i2, i2 + 7);
          swap(this, i2 + 1, i2 + 6);
          swap(this, i2 + 2, i2 + 5);
          swap(this, i2 + 3, i2 + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b2) {
        if (!Buffer3.isBuffer(b2)) throw new TypeError("Argument must be a Buffer");
        if (this === b2) return true;
        return Buffer3.compare(this, b2) === 0;
      };
      Buffer3.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x2 = thisEnd - thisStart;
        let y2 = end - start;
        const len = Math.min(x2, y2);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i2 = 0; i2 < len; ++i2) {
          if (thisCopy[i2] !== targetCopy[i2]) {
            x2 = thisCopy[i2];
            y2 = targetCopy[i2];
            break;
          }
        }
        if (x2 < y2) return -1;
        if (y2 < x2) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i3) {
          if (indexSize === 1) {
            return buf[i3];
          } else {
            return buf.readUInt16BE(i3 * indexSize);
          }
        }
        let i2;
        if (dir) {
          let foundIndex = -1;
          for (i2 = byteOffset; i2 < arrLength; i2++) {
            if (read(arr, i2) === read(val, foundIndex === -1 ? 0 : i2 - foundIndex)) {
              if (foundIndex === -1) foundIndex = i2;
              if (i2 - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i2 -= i2 - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i2 = byteOffset; i2 >= 0; i2--) {
            let found = true;
            for (let j2 = 0; j2 < valLength; j2++) {
              if (read(arr, i2 + j2) !== read(val, j2)) {
                found = false;
                break;
              }
            }
            if (found) return i2;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i2;
        for (i2 = 0; i2 < length; ++i2) {
          const parsed = parseInt(string.substr(i2 * 2, 2), 16);
          if (numberIsNaN(parsed)) return i2;
          buf[offset + i2] = parsed;
        }
        return i2;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i2 = start;
        while (i2 < end) {
          const firstByte = buf[i2];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i2 + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i2 + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i2 + 1];
                thirdByte = buf[i2 + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i2 + 1];
                thirdByte = buf[i2 + 2];
                fourthByte = buf[i2 + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i2 += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i2 = 0;
        while (i2 < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i2, i2 += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i2 = start; i2 < end; ++i2) {
          ret += String.fromCharCode(buf[i2] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i2 = start; i2 < end; ++i2) {
          ret += String.fromCharCode(buf[i2]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i2 = start; i2 < end; ++i2) {
          out += hexSliceLookupTable[buf[i2]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i2 = 0; i2 < bytes.length - 1; i2 += 2) {
          res += String.fromCharCode(bytes[i2] + bytes[i2 + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i2 = 0;
        while (++i2 < byteLength2 && (mul *= 256)) {
          val += this[offset + i2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i2 = 0;
        while (++i2 < byteLength2 && (mul *= 256)) {
          val += this[offset + i2] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i2 = byteLength2;
        let mul = 1;
        let val = this[offset + --i2];
        while (i2 > 0 && (mul *= 256)) {
          val += this[offset + --i2] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i2 = 0;
        this[offset] = value & 255;
        while (++i2 < byteLength2 && (mul *= 256)) {
          this[offset + i2] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i2 = byteLength2 - 1;
        let mul = 1;
        this[offset + i2] = value & 255;
        while (--i2 >= 0 && (mul *= 256)) {
          this[offset + i2] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i2 = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i2 < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i2 - 1] !== 0) {
            sub = 1;
          }
          this[offset + i2] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i2 = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i2] = value & 255;
        while (--i2 >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i2 + 1] !== 0) {
            sub = 1;
          }
          this[offset + i2] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i2;
        if (typeof val === "number") {
          for (i2 = start; i2 < end; ++i2) {
            this[i2] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i2 = 0; i2 < end - start; ++i2) {
            this[i2 + start] = bytes[i2 % len];
          }
        }
        return this;
      };
      var errors = {};
      function E2(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E2(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E2(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E2(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i2 = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i2 >= start + 4; i2 -= 3) {
          res = `_${val.slice(i2 - 3, i2)}${res}`;
        }
        return `${val.slice(0, i2)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n2 = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n2} and < 2${n2} ** ${(byteLength2 + 1) * 8}${n2}`;
            } else {
              range = `>= -(2${n2} ** ${(byteLength2 + 1) * 8 - 1}${n2}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n2}`;
            }
          } else {
            range = `>= ${min}${n2} and <= ${max}${n2}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i2 = 0; i2 < length; ++i2) {
          codePoint = string.charCodeAt(i2);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i2 + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i2 = 0; i2 < str.length; ++i2) {
          byteArray.push(str.charCodeAt(i2) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c2, hi, lo;
        const byteArray = [];
        for (let i2 = 0; i2 < str.length; ++i2) {
          if ((units -= 2) < 0) break;
          c2 = str.charCodeAt(i2);
          hi = c2 >> 8;
          lo = c2 % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i2;
        for (i2 = 0; i2 < length; ++i2) {
          if (i2 + offset >= dst.length || i2 >= src.length) break;
          dst[i2 + offset] = src[i2];
        }
        return i2;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i2 = 0; i2 < 16; ++i2) {
          const i16 = i2 * 16;
          for (let j2 = 0; j2 < 16; ++j2) {
            table[i16 + j2] = alphabet[i2] + alphabet[j2];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // packages/core/runtime/node-globals.ts
  var import_buffer = __toESM(require_buffer(), 1);

  // node_modules/web-streams-polyfill/dist/ponyfill.mjs
  function e() {
  }
  function t(e2) {
    return "object" == typeof e2 && null !== e2 || "function" == typeof e2;
  }
  var r = e;
  function o(e2, t2) {
    try {
      Object.defineProperty(e2, "name", { value: t2, configurable: true });
    } catch (e3) {
    }
  }
  var n = Promise;
  var a = Promise.resolve.bind(n);
  var i = Promise.prototype.then;
  var l = Promise.reject.bind(n);
  var s = a;
  function u(e2) {
    return new n(e2);
  }
  function c(e2) {
    return u((t2) => t2(e2));
  }
  function d(e2) {
    return l(e2);
  }
  function f(e2, t2, r2) {
    return i.call(e2, t2, r2);
  }
  function b(e2, t2, o2) {
    f(f(e2, t2, o2), void 0, r);
  }
  function h(e2, t2) {
    b(e2, t2);
  }
  function m(e2, t2) {
    b(e2, void 0, t2);
  }
  function _(e2, t2, r2) {
    return f(e2, t2, r2);
  }
  function p(e2) {
    f(e2, void 0, r);
  }
  var y = (e2) => {
    if ("function" == typeof queueMicrotask) y = queueMicrotask;
    else {
      const e3 = c(void 0);
      y = (t2) => f(e3, t2);
    }
    return y(e2);
  };
  function S(e2, t2, r2) {
    if ("function" != typeof e2) throw new TypeError("Argument is not a function");
    return Function.prototype.apply.call(e2, t2, r2);
  }
  function g(e2, t2, r2) {
    try {
      return c(S(e2, t2, r2));
    } catch (e3) {
      return d(e3);
    }
  }
  var v = class {
    constructor() {
      this._cursor = 0, this._size = 0, this._front = { _elements: [], _next: void 0 }, this._back = this._front, this._cursor = 0, this._size = 0;
    }
    get length() {
      return this._size;
    }
    push(e2) {
      const t2 = this._back;
      let r2 = t2;
      16383 === t2._elements.length && (r2 = { _elements: [], _next: void 0 }), t2._elements.push(e2), r2 !== t2 && (this._back = r2, t2._next = r2), ++this._size;
    }
    shift() {
      const e2 = this._front;
      let t2 = e2;
      const r2 = this._cursor;
      let o2 = r2 + 1;
      const n2 = e2._elements, a2 = n2[r2];
      return 16384 === o2 && (t2 = e2._next, o2 = 0), --this._size, this._cursor = o2, e2 !== t2 && (this._front = t2), n2[r2] = void 0, a2;
    }
    forEach(e2) {
      let t2 = this._cursor, r2 = this._front, o2 = r2._elements;
      for (; !(t2 === o2.length && void 0 === r2._next || t2 === o2.length && (r2 = r2._next, o2 = r2._elements, t2 = 0, 0 === o2.length)); ) e2(o2[t2]), ++t2;
    }
    peek() {
      const e2 = this._front, t2 = this._cursor;
      return e2._elements[t2];
    }
  };
  var w = /* @__PURE__ */ Symbol("[[AbortSteps]]");
  var R = /* @__PURE__ */ Symbol("[[ErrorSteps]]");
  var T = /* @__PURE__ */ Symbol("[[CancelSteps]]");
  var C = /* @__PURE__ */ Symbol("[[PullSteps]]");
  var P = /* @__PURE__ */ Symbol("[[ReleaseSteps]]");
  function q(e2, t2) {
    e2._ownerReadableStream = t2, t2._reader = e2, "readable" === t2._state ? B(e2) : "closed" === t2._state ? (function(e3) {
      B(e3), A(e3);
    })(e2) : k(e2, t2._storedError);
  }
  function E(e2, t2) {
    return Or(e2._ownerReadableStream, t2);
  }
  function W(e2) {
    const t2 = e2._ownerReadableStream;
    "readable" === t2._state ? j(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")) : (function(e3, t3) {
      k(e3, t3);
    })(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")), t2._readableStreamController[P](), t2._reader = void 0, e2._ownerReadableStream = void 0;
  }
  function O(e2) {
    return new TypeError("Cannot " + e2 + " a stream using a released reader");
  }
  function B(e2) {
    e2._closedPromise = u((t2, r2) => {
      e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2;
    });
  }
  function k(e2, t2) {
    B(e2), j(e2, t2);
  }
  function j(e2, t2) {
    void 0 !== e2._closedPromise_reject && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
  }
  function A(e2) {
    void 0 !== e2._closedPromise_resolve && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
  }
  var z = Number.isFinite || function(e2) {
    return "number" == typeof e2 && isFinite(e2);
  };
  var D = Math.trunc || function(e2) {
    return e2 < 0 ? Math.ceil(e2) : Math.floor(e2);
  };
  function L(e2, t2) {
    if (void 0 !== e2 && ("object" != typeof (r2 = e2) && "function" != typeof r2)) throw new TypeError(`${t2} is not an object.`);
    var r2;
  }
  function F(e2, t2) {
    if ("function" != typeof e2) throw new TypeError(`${t2} is not a function.`);
  }
  function I(e2, t2) {
    if (!/* @__PURE__ */ (function(e3) {
      return "object" == typeof e3 && null !== e3 || "function" == typeof e3;
    })(e2)) throw new TypeError(`${t2} is not an object.`);
  }
  function $(e2, t2, r2) {
    if (void 0 === e2) throw new TypeError(`Parameter ${t2} is required in '${r2}'.`);
  }
  function M(e2, t2, r2) {
    if (void 0 === e2) throw new TypeError(`${t2} is required in '${r2}'.`);
  }
  function Y(e2) {
    return Number(e2);
  }
  function x(e2) {
    return 0 === e2 ? 0 : e2;
  }
  function Q(e2, t2) {
    const r2 = Number.MAX_SAFE_INTEGER;
    let o2 = Number(e2);
    if (o2 = x(o2), !z(o2)) throw new TypeError(`${t2} is not a finite number`);
    if (o2 = (function(e3) {
      return x(D(e3));
    })(o2), o2 < 0 || o2 > r2) throw new TypeError(`${t2} is outside the accepted range of 0 to ${r2}, inclusive`);
    return z(o2) && 0 !== o2 ? o2 : 0;
  }
  function N(e2, t2) {
    if (!Er(e2)) throw new TypeError(`${t2} is not a ReadableStream.`);
  }
  function H(e2) {
    return new ReadableStreamDefaultReader(e2);
  }
  function V(e2, t2) {
    e2._reader._readRequests.push(t2);
  }
  function U(e2, t2, r2) {
    const o2 = e2._reader._readRequests.shift();
    r2 ? o2._closeSteps() : o2._chunkSteps(t2);
  }
  function G(e2) {
    return e2._reader._readRequests.length;
  }
  function X(e2) {
    const t2 = e2._reader;
    return void 0 !== t2 && !!J(t2);
  }
  var ReadableStreamDefaultReader = class {
    constructor(e2) {
      if ($(e2, 1, "ReadableStreamDefaultReader"), N(e2, "First parameter"), Wr(e2)) throw new TypeError("This stream has already been locked for exclusive reading by another reader");
      q(this, e2), this._readRequests = new v();
    }
    get closed() {
      return J(this) ? this._closedPromise : d(ee("closed"));
    }
    cancel(e2 = void 0) {
      return J(this) ? void 0 === this._ownerReadableStream ? d(O("cancel")) : E(this, e2) : d(ee("cancel"));
    }
    read() {
      if (!J(this)) return d(ee("read"));
      if (void 0 === this._ownerReadableStream) return d(O("read from"));
      let e2, t2;
      const r2 = u((r3, o2) => {
        e2 = r3, t2 = o2;
      });
      return K(this, { _chunkSteps: (t3) => e2({ value: t3, done: false }), _closeSteps: () => e2({ value: void 0, done: true }), _errorSteps: (e3) => t2(e3) }), r2;
    }
    releaseLock() {
      if (!J(this)) throw ee("releaseLock");
      void 0 !== this._ownerReadableStream && (function(e2) {
        W(e2);
        const t2 = new TypeError("Reader was released");
        Z(e2, t2);
      })(this);
    }
  };
  function J(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readRequests") && e2 instanceof ReadableStreamDefaultReader);
  }
  function K(e2, t2) {
    const r2 = e2._ownerReadableStream;
    r2._disturbed = true, "closed" === r2._state ? t2._closeSteps() : "errored" === r2._state ? t2._errorSteps(r2._storedError) : r2._readableStreamController[C](t2);
  }
  function Z(e2, t2) {
    const r2 = e2._readRequests;
    e2._readRequests = new v(), r2.forEach((e3) => {
      e3._errorSteps(t2);
    });
  }
  function ee(e2) {
    return new TypeError(`ReadableStreamDefaultReader.prototype.${e2} can only be used on a ReadableStreamDefaultReader`);
  }
  var te;
  var re;
  var oe;
  function ne(e2) {
    return e2.slice();
  }
  function ae(e2, t2, r2, o2, n2) {
    new Uint8Array(e2).set(new Uint8Array(r2, o2, n2), t2);
  }
  Object.defineProperties(ReadableStreamDefaultReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), o(ReadableStreamDefaultReader.prototype.cancel, "cancel"), o(ReadableStreamDefaultReader.prototype.read, "read"), o(ReadableStreamDefaultReader.prototype.releaseLock, "releaseLock"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamDefaultReader.prototype, Symbol.toStringTag, { value: "ReadableStreamDefaultReader", configurable: true });
  var ie = (e2) => (ie = "function" == typeof e2.transfer ? (e3) => e3.transfer() : "function" == typeof structuredClone ? (e3) => structuredClone(e3, { transfer: [e3] }) : (e3) => e3, ie(e2));
  var le = (e2) => (le = "boolean" == typeof e2.detached ? (e3) => e3.detached : (e3) => 0 === e3.byteLength, le(e2));
  function se(e2, t2, r2) {
    if (e2.slice) return e2.slice(t2, r2);
    const o2 = r2 - t2, n2 = new ArrayBuffer(o2);
    return ae(n2, 0, e2, t2, o2), n2;
  }
  function ue(e2, t2) {
    const r2 = e2[t2];
    if (null != r2) {
      if ("function" != typeof r2) throw new TypeError(`${String(t2)} is not a function`);
      return r2;
    }
  }
  function ce(e2) {
    try {
      const t2 = e2.done, r2 = e2.value;
      return f(s(r2), (e3) => ({ done: t2, value: e3 }));
    } catch (e3) {
      return d(e3);
    }
  }
  var de = null !== (oe = null !== (te = Symbol.asyncIterator) && void 0 !== te ? te : null === (re = Symbol.for) || void 0 === re ? void 0 : re.call(Symbol, "Symbol.asyncIterator")) && void 0 !== oe ? oe : "@@asyncIterator";
  function fe(e2, r2 = "sync", o2) {
    if (void 0 === o2) if ("async" === r2) {
      if (void 0 === (o2 = ue(e2, de))) {
        return (function(e3) {
          const r3 = { next() {
            let t2;
            try {
              t2 = be(e3);
            } catch (e4) {
              return d(e4);
            }
            return ce(t2);
          }, return(r4) {
            let o3;
            try {
              const t2 = ue(e3.iterator, "return");
              if (void 0 === t2) return c({ done: true, value: r4 });
              o3 = S(t2, e3.iterator, [r4]);
            } catch (e4) {
              return d(e4);
            }
            return t(o3) ? ce(o3) : d(new TypeError("The iterator.return() method must return an object"));
          } };
          return { iterator: r3, nextMethod: r3.next, done: false };
        })(fe(e2, "sync", ue(e2, Symbol.iterator)));
      }
    } else o2 = ue(e2, Symbol.iterator);
    if (void 0 === o2) throw new TypeError("The object is not iterable");
    const n2 = S(o2, e2, []);
    if (!t(n2)) throw new TypeError("The iterator method must return an object");
    return { iterator: n2, nextMethod: n2.next, done: false };
  }
  function be(e2) {
    const r2 = S(e2.nextMethod, e2.iterator, []);
    if (!t(r2)) throw new TypeError("The iterator.next() method must return an object");
    return r2;
  }
  var he = class {
    constructor(e2, t2) {
      this._ongoingPromise = void 0, this._isFinished = false, this._reader = e2, this._preventCancel = t2;
    }
    next() {
      const e2 = () => this._nextSteps();
      return this._ongoingPromise = this._ongoingPromise ? _(this._ongoingPromise, e2, e2) : e2(), this._ongoingPromise;
    }
    return(e2) {
      const t2 = () => this._returnSteps(e2);
      return this._ongoingPromise = this._ongoingPromise ? _(this._ongoingPromise, t2, t2) : t2(), this._ongoingPromise;
    }
    _nextSteps() {
      if (this._isFinished) return Promise.resolve({ value: void 0, done: true });
      const e2 = this._reader;
      let t2, r2;
      const o2 = u((e3, o3) => {
        t2 = e3, r2 = o3;
      });
      return K(e2, { _chunkSteps: (e3) => {
        this._ongoingPromise = void 0, y(() => t2({ value: e3, done: false }));
      }, _closeSteps: () => {
        this._ongoingPromise = void 0, this._isFinished = true, W(e2), t2({ value: void 0, done: true });
      }, _errorSteps: (t3) => {
        this._ongoingPromise = void 0, this._isFinished = true, W(e2), r2(t3);
      } }), o2;
    }
    _returnSteps(e2) {
      if (this._isFinished) return Promise.resolve({ value: e2, done: true });
      this._isFinished = true;
      const t2 = this._reader;
      if (!this._preventCancel) {
        const r2 = E(t2, e2);
        return W(t2), _(r2, () => ({ value: e2, done: true }));
      }
      return W(t2), c({ value: e2, done: true });
    }
  };
  var me = { next() {
    return _e(this) ? this._asyncIteratorImpl.next() : d(pe("next"));
  }, return(e2) {
    return _e(this) ? this._asyncIteratorImpl.return(e2) : d(pe("return"));
  }, [de]() {
    return this;
  } };
  function _e(e2) {
    if (!t(e2)) return false;
    if (!Object.prototype.hasOwnProperty.call(e2, "_asyncIteratorImpl")) return false;
    try {
      return e2._asyncIteratorImpl instanceof he;
    } catch (e3) {
      return false;
    }
  }
  function pe(e2) {
    return new TypeError(`ReadableStreamAsyncIterator.${e2} can only be used on a ReadableSteamAsyncIterator`);
  }
  Object.defineProperty(me, de, { enumerable: false });
  var ye = Number.isNaN || function(e2) {
    return e2 != e2;
  };
  function Se(e2) {
    const t2 = se(e2.buffer, e2.byteOffset, e2.byteOffset + e2.byteLength);
    return new Uint8Array(t2);
  }
  function ge(e2) {
    const t2 = e2._queue.shift();
    return e2._queueTotalSize -= t2.size, e2._queueTotalSize < 0 && (e2._queueTotalSize = 0), t2.value;
  }
  function ve(e2, t2, r2) {
    if ("number" != typeof (o2 = r2) || ye(o2) || o2 < 0 || r2 === 1 / 0) throw new RangeError("Size must be a finite, non-NaN, non-negative number.");
    var o2;
    e2._queue.push({ value: t2, size: r2 }), e2._queueTotalSize += r2;
  }
  function we(e2) {
    e2._queue = new v(), e2._queueTotalSize = 0;
  }
  function Re(e2) {
    return e2 === DataView;
  }
  var ReadableStreamBYOBRequest = class {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get view() {
      if (!Ce(this)) throw Ke("view");
      return this._view;
    }
    respond(e2) {
      if (!Ce(this)) throw Ke("respond");
      if ($(e2, 1, "respond"), e2 = Q(e2, "First parameter"), void 0 === this._associatedReadableByteStreamController) throw new TypeError("This BYOB request has been invalidated");
      if (le(this._view.buffer)) throw new TypeError("The BYOB request's buffer has been detached and so cannot be used as a response");
      Ge(this._associatedReadableByteStreamController, e2);
    }
    respondWithNewView(e2) {
      if (!Ce(this)) throw Ke("respondWithNewView");
      if ($(e2, 1, "respondWithNewView"), !ArrayBuffer.isView(e2)) throw new TypeError("You can only respond with array buffer views");
      if (void 0 === this._associatedReadableByteStreamController) throw new TypeError("This BYOB request has been invalidated");
      if (le(e2.buffer)) throw new TypeError("The given view's buffer has been detached and so cannot be used as a response");
      Xe(this._associatedReadableByteStreamController, e2);
    }
  };
  Object.defineProperties(ReadableStreamBYOBRequest.prototype, { respond: { enumerable: true }, respondWithNewView: { enumerable: true }, view: { enumerable: true } }), o(ReadableStreamBYOBRequest.prototype.respond, "respond"), o(ReadableStreamBYOBRequest.prototype.respondWithNewView, "respondWithNewView"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamBYOBRequest.prototype, Symbol.toStringTag, { value: "ReadableStreamBYOBRequest", configurable: true });
  var ReadableByteStreamController = class {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get byobRequest() {
      if (!Te(this)) throw Ze("byobRequest");
      return Ve(this);
    }
    get desiredSize() {
      if (!Te(this)) throw Ze("desiredSize");
      return Ue(this);
    }
    close() {
      if (!Te(this)) throw Ze("close");
      if (this._closeRequested) throw new TypeError("The stream has already been closed; do not close it again!");
      const e2 = this._controlledReadableByteStream._state;
      if ("readable" !== e2) throw new TypeError(`The stream (in ${e2} state) is not in the readable state and cannot be closed`);
      xe(this);
    }
    enqueue(e2) {
      if (!Te(this)) throw Ze("enqueue");
      if ($(e2, 1, "enqueue"), !ArrayBuffer.isView(e2)) throw new TypeError("chunk must be an array buffer view");
      if (0 === e2.byteLength) throw new TypeError("chunk must have non-zero byteLength");
      if (0 === e2.buffer.byteLength) throw new TypeError("chunk's buffer must have non-zero byteLength");
      if (this._closeRequested) throw new TypeError("stream is closed or draining");
      const t2 = this._controlledReadableByteStream._state;
      if ("readable" !== t2) throw new TypeError(`The stream (in ${t2} state) is not in the readable state and cannot be enqueued to`);
      Qe(this, e2);
    }
    error(e2 = void 0) {
      if (!Te(this)) throw Ze("error");
      Ne(this, e2);
    }
    [T](e2) {
      qe(this), we(this);
      const t2 = this._cancelAlgorithm(e2);
      return Ye(this), t2;
    }
    [C](e2) {
      const t2 = this._controlledReadableByteStream;
      if (this._queueTotalSize > 0) return void He(this, e2);
      const r2 = this._autoAllocateChunkSize;
      if (void 0 !== r2) {
        let t3;
        try {
          t3 = new ArrayBuffer(r2);
        } catch (t4) {
          return void e2._errorSteps(t4);
        }
        const o2 = { buffer: t3, bufferByteLength: r2, byteOffset: 0, byteLength: r2, bytesFilled: 0, minimumFill: 1, elementSize: 1, viewConstructor: Uint8Array, readerType: "default" };
        this._pendingPullIntos.push(o2);
      }
      V(t2, e2), Pe(this);
    }
    [P]() {
      if (this._pendingPullIntos.length > 0) {
        const e2 = this._pendingPullIntos.peek();
        e2.readerType = "none", this._pendingPullIntos = new v(), this._pendingPullIntos.push(e2);
      }
    }
  };
  function Te(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableByteStream") && e2 instanceof ReadableByteStreamController);
  }
  function Ce(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_associatedReadableByteStreamController") && e2 instanceof ReadableStreamBYOBRequest);
  }
  function Pe(e2) {
    const t2 = (function(e3) {
      const t3 = e3._controlledReadableByteStream;
      if ("readable" !== t3._state) return false;
      if (e3._closeRequested) return false;
      if (!e3._started) return false;
      if (X(t3) && G(t3) > 0) return true;
      if (nt(t3) && ot(t3) > 0) return true;
      const r2 = Ue(e3);
      if (r2 > 0) return true;
      return false;
    })(e2);
    if (!t2) return;
    if (e2._pulling) return void (e2._pullAgain = true);
    e2._pulling = true;
    b(e2._pullAlgorithm(), () => (e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, Pe(e2)), null), (t3) => (Ne(e2, t3), null));
  }
  function qe(e2) {
    Le(e2), e2._pendingPullIntos = new v();
  }
  function Ee(e2, t2) {
    let r2 = false;
    "closed" === e2._state && (r2 = true);
    const o2 = Oe(t2);
    "default" === t2.readerType ? U(e2, o2, r2) : (function(e3, t3, r3) {
      const o3 = e3._reader, n2 = o3._readIntoRequests.shift();
      r3 ? n2._closeSteps(t3) : n2._chunkSteps(t3);
    })(e2, o2, r2);
  }
  function We(e2, t2) {
    for (let r2 = 0; r2 < t2.length; ++r2) Ee(e2, t2[r2]);
  }
  function Oe(e2) {
    const t2 = e2.bytesFilled, r2 = e2.elementSize;
    return new e2.viewConstructor(e2.buffer, e2.byteOffset, t2 / r2);
  }
  function Be(e2, t2, r2, o2) {
    e2._queue.push({ buffer: t2, byteOffset: r2, byteLength: o2 }), e2._queueTotalSize += o2;
  }
  function ke(e2, t2, r2, o2) {
    let n2;
    try {
      n2 = se(t2, r2, r2 + o2);
    } catch (t3) {
      throw Ne(e2, t3), t3;
    }
    Be(e2, n2, 0, o2);
  }
  function je(e2, t2) {
    t2.bytesFilled > 0 && ke(e2, t2.buffer, t2.byteOffset, t2.bytesFilled), Me(e2);
  }
  function Ae(e2, t2) {
    const r2 = Math.min(e2._queueTotalSize, t2.byteLength - t2.bytesFilled), o2 = t2.bytesFilled + r2;
    let n2 = r2, a2 = false;
    const i2 = o2 - o2 % t2.elementSize;
    i2 >= t2.minimumFill && (n2 = i2 - t2.bytesFilled, a2 = true);
    const l2 = e2._queue;
    for (; n2 > 0; ) {
      const r3 = l2.peek(), o3 = Math.min(n2, r3.byteLength), a3 = t2.byteOffset + t2.bytesFilled;
      ae(t2.buffer, a3, r3.buffer, r3.byteOffset, o3), r3.byteLength === o3 ? l2.shift() : (r3.byteOffset += o3, r3.byteLength -= o3), e2._queueTotalSize -= o3, ze(e2, o3, t2), n2 -= o3;
    }
    return a2;
  }
  function ze(e2, t2, r2) {
    r2.bytesFilled += t2;
  }
  function De(e2) {
    0 === e2._queueTotalSize && e2._closeRequested ? (Ye(e2), Br(e2._controlledReadableByteStream)) : Pe(e2);
  }
  function Le(e2) {
    null !== e2._byobRequest && (e2._byobRequest._associatedReadableByteStreamController = void 0, e2._byobRequest._view = null, e2._byobRequest = null);
  }
  function Fe(e2) {
    const t2 = [];
    for (; e2._pendingPullIntos.length > 0 && 0 !== e2._queueTotalSize; ) {
      const r2 = e2._pendingPullIntos.peek();
      Ae(e2, r2) && (Me(e2), t2.push(r2));
    }
    return t2;
  }
  function Ie(e2, t2, r2, o2) {
    const n2 = e2._controlledReadableByteStream, a2 = t2.constructor, i2 = (function(e3) {
      return Re(e3) ? 1 : e3.BYTES_PER_ELEMENT;
    })(a2), { byteOffset: l2, byteLength: s2 } = t2, u2 = r2 * i2;
    let c2;
    try {
      c2 = ie(t2.buffer);
    } catch (e3) {
      return void o2._errorSteps(e3);
    }
    const d2 = { buffer: c2, bufferByteLength: c2.byteLength, byteOffset: l2, byteLength: s2, bytesFilled: 0, minimumFill: u2, elementSize: i2, viewConstructor: a2, readerType: "byob" };
    if (e2._pendingPullIntos.length > 0) return e2._pendingPullIntos.push(d2), void rt(n2, o2);
    if ("closed" === n2._state) {
      const e3 = new a2(d2.buffer, d2.byteOffset, 0);
      return void o2._closeSteps(e3);
    }
    if (e2._queueTotalSize > 0) {
      if (Ae(e2, d2)) {
        const t3 = Oe(d2);
        return De(e2), void o2._chunkSteps(t3);
      }
      if (e2._closeRequested) {
        const t3 = new TypeError("Insufficient bytes to fill elements in the given buffer");
        return Ne(e2, t3), void o2._errorSteps(t3);
      }
    }
    e2._pendingPullIntos.push(d2), rt(n2, o2), Pe(e2);
  }
  function $e(e2, t2) {
    const r2 = e2._pendingPullIntos.peek();
    Le(e2);
    "closed" === e2._controlledReadableByteStream._state ? (function(e3, t3) {
      "none" === t3.readerType && Me(e3);
      const r3 = e3._controlledReadableByteStream;
      if (nt(r3)) {
        const t4 = [];
        for (; t4.length < ot(r3); ) t4.push(Me(e3));
        We(r3, t4);
      }
    })(e2, r2) : (function(e3, t3, r3) {
      if (ze(0, t3, r3), "none" === r3.readerType) {
        je(e3, r3);
        const t4 = Fe(e3);
        return void We(e3._controlledReadableByteStream, t4);
      }
      if (r3.bytesFilled < r3.minimumFill) return;
      Me(e3);
      const o2 = r3.bytesFilled % r3.elementSize;
      if (o2 > 0) {
        const t4 = r3.byteOffset + r3.bytesFilled;
        ke(e3, r3.buffer, t4 - o2, o2);
      }
      r3.bytesFilled -= o2;
      const n2 = Fe(e3);
      Ee(e3._controlledReadableByteStream, r3), We(e3._controlledReadableByteStream, n2);
    })(e2, t2, r2), Pe(e2);
  }
  function Me(e2) {
    return e2._pendingPullIntos.shift();
  }
  function Ye(e2) {
    e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0;
  }
  function xe(e2) {
    const t2 = e2._controlledReadableByteStream;
    if (!e2._closeRequested && "readable" === t2._state) if (e2._queueTotalSize > 0) e2._closeRequested = true;
    else {
      if (e2._pendingPullIntos.length > 0) {
        const t3 = e2._pendingPullIntos.peek();
        if (t3.bytesFilled % t3.elementSize !== 0) {
          const t4 = new TypeError("Insufficient bytes to fill elements in the given buffer");
          throw Ne(e2, t4), t4;
        }
      }
      Ye(e2), Br(t2);
    }
  }
  function Qe(e2, t2) {
    const r2 = e2._controlledReadableByteStream;
    if (e2._closeRequested || "readable" !== r2._state) return;
    const { buffer: o2, byteOffset: n2, byteLength: a2 } = t2;
    if (le(o2)) throw new TypeError("chunk's buffer is detached and so cannot be enqueued");
    const i2 = ie(o2);
    if (e2._pendingPullIntos.length > 0) {
      const t3 = e2._pendingPullIntos.peek();
      if (le(t3.buffer)) throw new TypeError("The BYOB request's buffer has been detached and so cannot be filled with an enqueued chunk");
      Le(e2), t3.buffer = ie(t3.buffer), "none" === t3.readerType && je(e2, t3);
    }
    if (X(r2)) if ((function(e3) {
      const t3 = e3._controlledReadableByteStream._reader;
      for (; t3._readRequests.length > 0; ) {
        if (0 === e3._queueTotalSize) return;
        He(e3, t3._readRequests.shift());
      }
    })(e2), 0 === G(r2)) Be(e2, i2, n2, a2);
    else {
      e2._pendingPullIntos.length > 0 && Me(e2);
      U(r2, new Uint8Array(i2, n2, a2), false);
    }
    else if (nt(r2)) {
      Be(e2, i2, n2, a2);
      We(r2, Fe(e2));
    } else Be(e2, i2, n2, a2);
    Pe(e2);
  }
  function Ne(e2, t2) {
    const r2 = e2._controlledReadableByteStream;
    "readable" === r2._state && (qe(e2), we(e2), Ye(e2), kr(r2, t2));
  }
  function He(e2, t2) {
    const r2 = e2._queue.shift();
    e2._queueTotalSize -= r2.byteLength, De(e2);
    const o2 = new Uint8Array(r2.buffer, r2.byteOffset, r2.byteLength);
    t2._chunkSteps(o2);
  }
  function Ve(e2) {
    if (null === e2._byobRequest && e2._pendingPullIntos.length > 0) {
      const t2 = e2._pendingPullIntos.peek(), r2 = new Uint8Array(t2.buffer, t2.byteOffset + t2.bytesFilled, t2.byteLength - t2.bytesFilled), o2 = Object.create(ReadableStreamBYOBRequest.prototype);
      !(function(e3, t3, r3) {
        e3._associatedReadableByteStreamController = t3, e3._view = r3;
      })(o2, e2, r2), e2._byobRequest = o2;
    }
    return e2._byobRequest;
  }
  function Ue(e2) {
    const t2 = e2._controlledReadableByteStream._state;
    return "errored" === t2 ? null : "closed" === t2 ? 0 : e2._strategyHWM - e2._queueTotalSize;
  }
  function Ge(e2, t2) {
    const r2 = e2._pendingPullIntos.peek();
    if ("closed" === e2._controlledReadableByteStream._state) {
      if (0 !== t2) throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");
    } else {
      if (0 === t2) throw new TypeError("bytesWritten must be greater than 0 when calling respond() on a readable stream");
      if (r2.bytesFilled + t2 > r2.byteLength) throw new RangeError("bytesWritten out of range");
    }
    r2.buffer = ie(r2.buffer), $e(e2, t2);
  }
  function Xe(e2, t2) {
    const r2 = e2._pendingPullIntos.peek();
    if ("closed" === e2._controlledReadableByteStream._state) {
      if (0 !== t2.byteLength) throw new TypeError("The view's length must be 0 when calling respondWithNewView() on a closed stream");
    } else if (0 === t2.byteLength) throw new TypeError("The view's length must be greater than 0 when calling respondWithNewView() on a readable stream");
    if (r2.byteOffset + r2.bytesFilled !== t2.byteOffset) throw new RangeError("The region specified by view does not match byobRequest");
    if (r2.bufferByteLength !== t2.buffer.byteLength) throw new RangeError("The buffer of view has different capacity than byobRequest");
    if (r2.bytesFilled + t2.byteLength > r2.byteLength) throw new RangeError("The region specified by view is larger than byobRequest");
    const o2 = t2.byteLength;
    r2.buffer = ie(t2.buffer), $e(e2, o2);
  }
  function Je(e2, t2, r2, o2, n2, a2, i2) {
    t2._controlledReadableByteStream = e2, t2._pullAgain = false, t2._pulling = false, t2._byobRequest = null, t2._queue = t2._queueTotalSize = void 0, we(t2), t2._closeRequested = false, t2._started = false, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, t2._autoAllocateChunkSize = i2, t2._pendingPullIntos = new v(), e2._readableStreamController = t2;
    b(c(r2()), () => (t2._started = true, Pe(t2), null), (e3) => (Ne(t2, e3), null));
  }
  function Ke(e2) {
    return new TypeError(`ReadableStreamBYOBRequest.prototype.${e2} can only be used on a ReadableStreamBYOBRequest`);
  }
  function Ze(e2) {
    return new TypeError(`ReadableByteStreamController.prototype.${e2} can only be used on a ReadableByteStreamController`);
  }
  function et(e2, t2) {
    if ("byob" !== (e2 = `${e2}`)) throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamReaderMode`);
    return e2;
  }
  function tt(e2) {
    return new ReadableStreamBYOBReader(e2);
  }
  function rt(e2, t2) {
    e2._reader._readIntoRequests.push(t2);
  }
  function ot(e2) {
    return e2._reader._readIntoRequests.length;
  }
  function nt(e2) {
    const t2 = e2._reader;
    return void 0 !== t2 && !!at(t2);
  }
  Object.defineProperties(ReadableByteStreamController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, byobRequest: { enumerable: true }, desiredSize: { enumerable: true } }), o(ReadableByteStreamController.prototype.close, "close"), o(ReadableByteStreamController.prototype.enqueue, "enqueue"), o(ReadableByteStreamController.prototype.error, "error"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableByteStreamController.prototype, Symbol.toStringTag, { value: "ReadableByteStreamController", configurable: true });
  var ReadableStreamBYOBReader = class {
    constructor(e2) {
      if ($(e2, 1, "ReadableStreamBYOBReader"), N(e2, "First parameter"), Wr(e2)) throw new TypeError("This stream has already been locked for exclusive reading by another reader");
      if (!Te(e2._readableStreamController)) throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");
      q(this, e2), this._readIntoRequests = new v();
    }
    get closed() {
      return at(this) ? this._closedPromise : d(st("closed"));
    }
    cancel(e2 = void 0) {
      return at(this) ? void 0 === this._ownerReadableStream ? d(O("cancel")) : E(this, e2) : d(st("cancel"));
    }
    read(e2, t2 = {}) {
      if (!at(this)) return d(st("read"));
      if (!ArrayBuffer.isView(e2)) return d(new TypeError("view must be an array buffer view"));
      if (0 === e2.byteLength) return d(new TypeError("view must have non-zero byteLength"));
      if (0 === e2.buffer.byteLength) return d(new TypeError("view's buffer must have non-zero byteLength"));
      if (le(e2.buffer)) return d(new TypeError("view's buffer has been detached"));
      let r2;
      try {
        r2 = (function(e3, t3) {
          var r3;
          return L(e3, t3), { min: Q(null !== (r3 = null == e3 ? void 0 : e3.min) && void 0 !== r3 ? r3 : 1, `${t3} has member 'min' that`) };
        })(t2, "options");
      } catch (e3) {
        return d(e3);
      }
      const o2 = r2.min;
      if (0 === o2) return d(new TypeError("options.min must be greater than 0"));
      if ((function(e3) {
        return Re(e3.constructor);
      })(e2)) {
        if (o2 > e2.byteLength) return d(new RangeError("options.min must be less than or equal to view's byteLength"));
      } else if (o2 > e2.length) return d(new RangeError("options.min must be less than or equal to view's length"));
      if (void 0 === this._ownerReadableStream) return d(O("read from"));
      let n2, a2;
      const i2 = u((e3, t3) => {
        n2 = e3, a2 = t3;
      });
      return it(this, e2, o2, { _chunkSteps: (e3) => n2({ value: e3, done: false }), _closeSteps: (e3) => n2({ value: e3, done: true }), _errorSteps: (e3) => a2(e3) }), i2;
    }
    releaseLock() {
      if (!at(this)) throw st("releaseLock");
      void 0 !== this._ownerReadableStream && (function(e2) {
        W(e2);
        const t2 = new TypeError("Reader was released");
        lt(e2, t2);
      })(this);
    }
  };
  function at(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readIntoRequests") && e2 instanceof ReadableStreamBYOBReader);
  }
  function it(e2, t2, r2, o2) {
    const n2 = e2._ownerReadableStream;
    n2._disturbed = true, "errored" === n2._state ? o2._errorSteps(n2._storedError) : Ie(n2._readableStreamController, t2, r2, o2);
  }
  function lt(e2, t2) {
    const r2 = e2._readIntoRequests;
    e2._readIntoRequests = new v(), r2.forEach((e3) => {
      e3._errorSteps(t2);
    });
  }
  function st(e2) {
    return new TypeError(`ReadableStreamBYOBReader.prototype.${e2} can only be used on a ReadableStreamBYOBReader`);
  }
  function ut(e2, t2) {
    const { highWaterMark: r2 } = e2;
    if (void 0 === r2) return t2;
    if (ye(r2) || r2 < 0) throw new RangeError("Invalid highWaterMark");
    return r2;
  }
  function ct(e2) {
    const { size: t2 } = e2;
    return t2 || (() => 1);
  }
  function dt(e2, t2) {
    L(e2, t2);
    const r2 = null == e2 ? void 0 : e2.highWaterMark, o2 = null == e2 ? void 0 : e2.size;
    return { highWaterMark: void 0 === r2 ? void 0 : Y(r2), size: void 0 === o2 ? void 0 : ft(o2, `${t2} has member 'size' that`) };
  }
  function ft(e2, t2) {
    return F(e2, t2), (t3) => Y(e2(t3));
  }
  function bt(e2, t2, r2) {
    return F(e2, r2), (r3) => g(e2, t2, [r3]);
  }
  function ht(e2, t2, r2) {
    return F(e2, r2), () => g(e2, t2, []);
  }
  function mt(e2, t2, r2) {
    return F(e2, r2), (r3) => S(e2, t2, [r3]);
  }
  function _t(e2, t2, r2) {
    return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
  }
  function pt(e2, t2) {
    if (!gt(e2)) throw new TypeError(`${t2} is not a WritableStream.`);
  }
  Object.defineProperties(ReadableStreamBYOBReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), o(ReadableStreamBYOBReader.prototype.cancel, "cancel"), o(ReadableStreamBYOBReader.prototype.read, "read"), o(ReadableStreamBYOBReader.prototype.releaseLock, "releaseLock"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, { value: "ReadableStreamBYOBReader", configurable: true });
  var WritableStream = class {
    constructor(e2 = {}, t2 = {}) {
      void 0 === e2 ? e2 = null : I(e2, "First parameter");
      const r2 = dt(t2, "Second parameter"), o2 = (function(e3, t3) {
        L(e3, t3);
        const r3 = null == e3 ? void 0 : e3.abort, o3 = null == e3 ? void 0 : e3.close, n3 = null == e3 ? void 0 : e3.start, a2 = null == e3 ? void 0 : e3.type, i2 = null == e3 ? void 0 : e3.write;
        return { abort: void 0 === r3 ? void 0 : bt(r3, e3, `${t3} has member 'abort' that`), close: void 0 === o3 ? void 0 : ht(o3, e3, `${t3} has member 'close' that`), start: void 0 === n3 ? void 0 : mt(n3, e3, `${t3} has member 'start' that`), write: void 0 === i2 ? void 0 : _t(i2, e3, `${t3} has member 'write' that`), type: a2 };
      })(e2, "First parameter");
      St(this);
      if (void 0 !== o2.type) throw new RangeError("Invalid type is specified");
      const n2 = ct(r2);
      !(function(e3, t3, r3, o3) {
        const n3 = Object.create(WritableStreamDefaultController.prototype);
        let a2, i2, l2, s2;
        a2 = void 0 !== t3.start ? () => t3.start(n3) : () => {
        };
        i2 = void 0 !== t3.write ? (e4) => t3.write(e4, n3) : () => c(void 0);
        l2 = void 0 !== t3.close ? () => t3.close() : () => c(void 0);
        s2 = void 0 !== t3.abort ? (e4) => t3.abort(e4) : () => c(void 0);
        Ft(e3, n3, a2, i2, l2, s2, r3, o3);
      })(this, o2, ut(r2, 1), n2);
    }
    get locked() {
      if (!gt(this)) throw Nt("locked");
      return vt(this);
    }
    abort(e2 = void 0) {
      return gt(this) ? vt(this) ? d(new TypeError("Cannot abort a stream that already has a writer")) : wt(this, e2) : d(Nt("abort"));
    }
    close() {
      return gt(this) ? vt(this) ? d(new TypeError("Cannot close a stream that already has a writer")) : qt(this) ? d(new TypeError("Cannot close an already-closing stream")) : Rt(this) : d(Nt("close"));
    }
    getWriter() {
      if (!gt(this)) throw Nt("getWriter");
      return yt(this);
    }
  };
  function yt(e2) {
    return new WritableStreamDefaultWriter(e2);
  }
  function St(e2) {
    e2._state = "writable", e2._storedError = void 0, e2._writer = void 0, e2._writableStreamController = void 0, e2._writeRequests = new v(), e2._inFlightWriteRequest = void 0, e2._closeRequest = void 0, e2._inFlightCloseRequest = void 0, e2._pendingAbortRequest = void 0, e2._backpressure = false;
  }
  function gt(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_writableStreamController") && e2 instanceof WritableStream);
  }
  function vt(e2) {
    return void 0 !== e2._writer;
  }
  function wt(e2, t2) {
    var r2;
    if ("closed" === e2._state || "errored" === e2._state) return c(void 0);
    e2._writableStreamController._abortReason = t2, null === (r2 = e2._writableStreamController._abortController) || void 0 === r2 || r2.abort(t2);
    const o2 = e2._state;
    if ("closed" === o2 || "errored" === o2) return c(void 0);
    if (void 0 !== e2._pendingAbortRequest) return e2._pendingAbortRequest._promise;
    let n2 = false;
    "erroring" === o2 && (n2 = true, t2 = void 0);
    const a2 = u((r3, o3) => {
      e2._pendingAbortRequest = { _promise: void 0, _resolve: r3, _reject: o3, _reason: t2, _wasAlreadyErroring: n2 };
    });
    return e2._pendingAbortRequest._promise = a2, n2 || Ct(e2, t2), a2;
  }
  function Rt(e2) {
    const t2 = e2._state;
    if ("closed" === t2 || "errored" === t2) return d(new TypeError(`The stream (in ${t2} state) is not in the writable state and cannot be closed`));
    const r2 = u((t3, r3) => {
      const o3 = { _resolve: t3, _reject: r3 };
      e2._closeRequest = o3;
    }), o2 = e2._writer;
    var n2;
    return void 0 !== o2 && e2._backpressure && "writable" === t2 && or(o2), ve(n2 = e2._writableStreamController, Dt, 0), Mt(n2), r2;
  }
  function Tt(e2, t2) {
    "writable" !== e2._state ? Pt(e2) : Ct(e2, t2);
  }
  function Ct(e2, t2) {
    const r2 = e2._writableStreamController;
    e2._state = "erroring", e2._storedError = t2;
    const o2 = e2._writer;
    void 0 !== o2 && jt(o2, t2), !(function(e3) {
      if (void 0 === e3._inFlightWriteRequest && void 0 === e3._inFlightCloseRequest) return false;
      return true;
    })(e2) && r2._started && Pt(e2);
  }
  function Pt(e2) {
    e2._state = "errored", e2._writableStreamController[R]();
    const t2 = e2._storedError;
    if (e2._writeRequests.forEach((e3) => {
      e3._reject(t2);
    }), e2._writeRequests = new v(), void 0 === e2._pendingAbortRequest) return void Et(e2);
    const r2 = e2._pendingAbortRequest;
    if (e2._pendingAbortRequest = void 0, r2._wasAlreadyErroring) return r2._reject(t2), void Et(e2);
    b(e2._writableStreamController[w](r2._reason), () => (r2._resolve(), Et(e2), null), (t3) => (r2._reject(t3), Et(e2), null));
  }
  function qt(e2) {
    return void 0 !== e2._closeRequest || void 0 !== e2._inFlightCloseRequest;
  }
  function Et(e2) {
    void 0 !== e2._closeRequest && (e2._closeRequest._reject(e2._storedError), e2._closeRequest = void 0);
    const t2 = e2._writer;
    void 0 !== t2 && Jt(t2, e2._storedError);
  }
  function Wt(e2, t2) {
    const r2 = e2._writer;
    void 0 !== r2 && t2 !== e2._backpressure && (t2 ? (function(e3) {
      Zt(e3);
    })(r2) : or(r2)), e2._backpressure = t2;
  }
  Object.defineProperties(WritableStream.prototype, { abort: { enumerable: true }, close: { enumerable: true }, getWriter: { enumerable: true }, locked: { enumerable: true } }), o(WritableStream.prototype.abort, "abort"), o(WritableStream.prototype.close, "close"), o(WritableStream.prototype.getWriter, "getWriter"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStream.prototype, Symbol.toStringTag, { value: "WritableStream", configurable: true });
  var WritableStreamDefaultWriter = class {
    constructor(e2) {
      if ($(e2, 1, "WritableStreamDefaultWriter"), pt(e2, "First parameter"), vt(e2)) throw new TypeError("This stream has already been locked for exclusive writing by another writer");
      this._ownerWritableStream = e2, e2._writer = this;
      const t2 = e2._state;
      if ("writable" === t2) !qt(e2) && e2._backpressure ? Zt(this) : tr(this), Gt(this);
      else if ("erroring" === t2) er(this, e2._storedError), Gt(this);
      else if ("closed" === t2) tr(this), Gt(r2 = this), Kt(r2);
      else {
        const t3 = e2._storedError;
        er(this, t3), Xt(this, t3);
      }
      var r2;
    }
    get closed() {
      return Ot(this) ? this._closedPromise : d(Vt("closed"));
    }
    get desiredSize() {
      if (!Ot(this)) throw Vt("desiredSize");
      if (void 0 === this._ownerWritableStream) throw Ut("desiredSize");
      return (function(e2) {
        const t2 = e2._ownerWritableStream, r2 = t2._state;
        if ("errored" === r2 || "erroring" === r2) return null;
        if ("closed" === r2) return 0;
        return $t(t2._writableStreamController);
      })(this);
    }
    get ready() {
      return Ot(this) ? this._readyPromise : d(Vt("ready"));
    }
    abort(e2 = void 0) {
      return Ot(this) ? void 0 === this._ownerWritableStream ? d(Ut("abort")) : (function(e3, t2) {
        return wt(e3._ownerWritableStream, t2);
      })(this, e2) : d(Vt("abort"));
    }
    close() {
      if (!Ot(this)) return d(Vt("close"));
      const e2 = this._ownerWritableStream;
      return void 0 === e2 ? d(Ut("close")) : qt(e2) ? d(new TypeError("Cannot close an already-closing stream")) : Bt(this);
    }
    releaseLock() {
      if (!Ot(this)) throw Vt("releaseLock");
      void 0 !== this._ownerWritableStream && At(this);
    }
    write(e2 = void 0) {
      return Ot(this) ? void 0 === this._ownerWritableStream ? d(Ut("write to")) : zt(this, e2) : d(Vt("write"));
    }
  };
  function Ot(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_ownerWritableStream") && e2 instanceof WritableStreamDefaultWriter);
  }
  function Bt(e2) {
    return Rt(e2._ownerWritableStream);
  }
  function kt(e2, t2) {
    "pending" === e2._closedPromiseState ? Jt(e2, t2) : (function(e3, t3) {
      Xt(e3, t3);
    })(e2, t2);
  }
  function jt(e2, t2) {
    "pending" === e2._readyPromiseState ? rr(e2, t2) : (function(e3, t3) {
      er(e3, t3);
    })(e2, t2);
  }
  function At(e2) {
    const t2 = e2._ownerWritableStream, r2 = new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");
    jt(e2, r2), kt(e2, r2), t2._writer = void 0, e2._ownerWritableStream = void 0;
  }
  function zt(e2, t2) {
    const r2 = e2._ownerWritableStream, o2 = r2._writableStreamController, n2 = (function(e3, t3) {
      if (void 0 === e3._strategySizeAlgorithm) return 1;
      try {
        return e3._strategySizeAlgorithm(t3);
      } catch (t4) {
        return Yt(e3, t4), 1;
      }
    })(o2, t2);
    if (r2 !== e2._ownerWritableStream) return d(Ut("write to"));
    const a2 = r2._state;
    if ("errored" === a2) return d(r2._storedError);
    if (qt(r2) || "closed" === a2) return d(new TypeError("The stream is closing or closed and cannot be written to"));
    if ("erroring" === a2) return d(r2._storedError);
    const i2 = (function(e3) {
      return u((t3, r3) => {
        const o3 = { _resolve: t3, _reject: r3 };
        e3._writeRequests.push(o3);
      });
    })(r2);
    return (function(e3, t3, r3) {
      try {
        ve(e3, t3, r3);
      } catch (t4) {
        return void Yt(e3, t4);
      }
      const o3 = e3._controlledWritableStream;
      if (!qt(o3) && "writable" === o3._state) {
        Wt(o3, xt(e3));
      }
      Mt(e3);
    })(o2, t2, n2), i2;
  }
  Object.defineProperties(WritableStreamDefaultWriter.prototype, { abort: { enumerable: true }, close: { enumerable: true }, releaseLock: { enumerable: true }, write: { enumerable: true }, closed: { enumerable: true }, desiredSize: { enumerable: true }, ready: { enumerable: true } }), o(WritableStreamDefaultWriter.prototype.abort, "abort"), o(WritableStreamDefaultWriter.prototype.close, "close"), o(WritableStreamDefaultWriter.prototype.releaseLock, "releaseLock"), o(WritableStreamDefaultWriter.prototype.write, "write"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStreamDefaultWriter.prototype, Symbol.toStringTag, { value: "WritableStreamDefaultWriter", configurable: true });
  var Dt = {};
  var WritableStreamDefaultController = class {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get abortReason() {
      if (!Lt(this)) throw Ht("abortReason");
      return this._abortReason;
    }
    get signal() {
      if (!Lt(this)) throw Ht("signal");
      if (void 0 === this._abortController) throw new TypeError("WritableStreamDefaultController.prototype.signal is not supported");
      return this._abortController.signal;
    }
    error(e2 = void 0) {
      if (!Lt(this)) throw Ht("error");
      "writable" === this._controlledWritableStream._state && Qt(this, e2);
    }
    [w](e2) {
      const t2 = this._abortAlgorithm(e2);
      return It(this), t2;
    }
    [R]() {
      we(this);
    }
  };
  function Lt(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledWritableStream") && e2 instanceof WritableStreamDefaultController);
  }
  function Ft(e2, t2, r2, o2, n2, a2, i2, l2) {
    t2._controlledWritableStream = e2, e2._writableStreamController = t2, t2._queue = void 0, t2._queueTotalSize = void 0, we(t2), t2._abortReason = void 0, t2._abortController = (function() {
      if ("function" == typeof AbortController) return new AbortController();
    })(), t2._started = false, t2._strategySizeAlgorithm = l2, t2._strategyHWM = i2, t2._writeAlgorithm = o2, t2._closeAlgorithm = n2, t2._abortAlgorithm = a2;
    const s2 = xt(t2);
    Wt(e2, s2);
    b(c(r2()), () => (t2._started = true, Mt(t2), null), (r3) => (t2._started = true, Tt(e2, r3), null));
  }
  function It(e2) {
    e2._writeAlgorithm = void 0, e2._closeAlgorithm = void 0, e2._abortAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
  }
  function $t(e2) {
    return e2._strategyHWM - e2._queueTotalSize;
  }
  function Mt(e2) {
    const t2 = e2._controlledWritableStream;
    if (!e2._started) return;
    if (void 0 !== t2._inFlightWriteRequest) return;
    if ("erroring" === t2._state) return void Pt(t2);
    if (0 === e2._queue.length) return;
    const r2 = e2._queue.peek().value;
    r2 === Dt ? (function(e3) {
      const t3 = e3._controlledWritableStream;
      (function(e4) {
        e4._inFlightCloseRequest = e4._closeRequest, e4._closeRequest = void 0;
      })(t3), ge(e3);
      const r3 = e3._closeAlgorithm();
      It(e3), b(r3, () => ((function(e4) {
        e4._inFlightCloseRequest._resolve(void 0), e4._inFlightCloseRequest = void 0, "erroring" === e4._state && (e4._storedError = void 0, void 0 !== e4._pendingAbortRequest && (e4._pendingAbortRequest._resolve(), e4._pendingAbortRequest = void 0)), e4._state = "closed";
        const t4 = e4._writer;
        void 0 !== t4 && Kt(t4);
      })(t3), null), (e4) => ((function(e5, t4) {
        e5._inFlightCloseRequest._reject(t4), e5._inFlightCloseRequest = void 0, void 0 !== e5._pendingAbortRequest && (e5._pendingAbortRequest._reject(t4), e5._pendingAbortRequest = void 0), Tt(e5, t4);
      })(t3, e4), null));
    })(e2) : (function(e3, t3) {
      const r3 = e3._controlledWritableStream;
      !(function(e4) {
        e4._inFlightWriteRequest = e4._writeRequests.shift();
      })(r3);
      const o2 = e3._writeAlgorithm(t3);
      b(o2, () => {
        !(function(e4) {
          e4._inFlightWriteRequest._resolve(void 0), e4._inFlightWriteRequest = void 0;
        })(r3);
        const t4 = r3._state;
        if (ge(e3), !qt(r3) && "writable" === t4) {
          const t5 = xt(e3);
          Wt(r3, t5);
        }
        return Mt(e3), null;
      }, (t4) => ("writable" === r3._state && It(e3), (function(e4, t5) {
        e4._inFlightWriteRequest._reject(t5), e4._inFlightWriteRequest = void 0, Tt(e4, t5);
      })(r3, t4), null));
    })(e2, r2);
  }
  function Yt(e2, t2) {
    "writable" === e2._controlledWritableStream._state && Qt(e2, t2);
  }
  function xt(e2) {
    return $t(e2) <= 0;
  }
  function Qt(e2, t2) {
    const r2 = e2._controlledWritableStream;
    It(e2), Ct(r2, t2);
  }
  function Nt(e2) {
    return new TypeError(`WritableStream.prototype.${e2} can only be used on a WritableStream`);
  }
  function Ht(e2) {
    return new TypeError(`WritableStreamDefaultController.prototype.${e2} can only be used on a WritableStreamDefaultController`);
  }
  function Vt(e2) {
    return new TypeError(`WritableStreamDefaultWriter.prototype.${e2} can only be used on a WritableStreamDefaultWriter`);
  }
  function Ut(e2) {
    return new TypeError("Cannot " + e2 + " a stream using a released writer");
  }
  function Gt(e2) {
    e2._closedPromise = u((t2, r2) => {
      e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2, e2._closedPromiseState = "pending";
    });
  }
  function Xt(e2, t2) {
    Gt(e2), Jt(e2, t2);
  }
  function Jt(e2, t2) {
    void 0 !== e2._closedPromise_reject && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "rejected");
  }
  function Kt(e2) {
    void 0 !== e2._closedPromise_resolve && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "resolved");
  }
  function Zt(e2) {
    e2._readyPromise = u((t2, r2) => {
      e2._readyPromise_resolve = t2, e2._readyPromise_reject = r2;
    }), e2._readyPromiseState = "pending";
  }
  function er(e2, t2) {
    Zt(e2), rr(e2, t2);
  }
  function tr(e2) {
    Zt(e2), or(e2);
  }
  function rr(e2, t2) {
    void 0 !== e2._readyPromise_reject && (p(e2._readyPromise), e2._readyPromise_reject(t2), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "rejected");
  }
  function or(e2) {
    void 0 !== e2._readyPromise_resolve && (e2._readyPromise_resolve(void 0), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "fulfilled");
  }
  Object.defineProperties(WritableStreamDefaultController.prototype, { abortReason: { enumerable: true }, signal: { enumerable: true }, error: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(WritableStreamDefaultController.prototype, Symbol.toStringTag, { value: "WritableStreamDefaultController", configurable: true });
  var nr = "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : "undefined" != typeof global ? global : void 0;
  var ar = (function() {
    const e2 = null == nr ? void 0 : nr.DOMException;
    return (function(e3) {
      if ("function" != typeof e3 && "object" != typeof e3) return false;
      if ("DOMException" !== e3.name) return false;
      try {
        return new e3(), true;
      } catch (e4) {
        return false;
      }
    })(e2) ? e2 : void 0;
  })() || (function() {
    const e2 = function(e3, t2) {
      this.message = e3 || "", this.name = t2 || "Error", Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
    };
    return o(e2, "DOMException"), e2.prototype = Object.create(Error.prototype), Object.defineProperty(e2.prototype, "constructor", { value: e2, writable: true, configurable: true }), e2;
  })();
  function ir(t2, r2, o2, n2, a2, i2) {
    const l2 = H(t2), s2 = yt(r2);
    t2._disturbed = true;
    let _2 = false, y2 = c(void 0);
    return u((S2, g2) => {
      let v2;
      if (void 0 !== i2) {
        if (v2 = () => {
          const e2 = void 0 !== i2.reason ? i2.reason : new ar("Aborted", "AbortError"), o3 = [];
          n2 || o3.push(() => "writable" === r2._state ? wt(r2, e2) : c(void 0)), a2 || o3.push(() => "readable" === t2._state ? Or(t2, e2) : c(void 0)), q2(() => Promise.all(o3.map((e3) => e3())), true, e2);
        }, i2.aborted) return void v2();
        i2.addEventListener("abort", v2);
      }
      var w2, R2, T2;
      if (P2(t2, l2._closedPromise, (e2) => (n2 ? E2(true, e2) : q2(() => wt(r2, e2), true, e2), null)), P2(r2, s2._closedPromise, (e2) => (a2 ? E2(true, e2) : q2(() => Or(t2, e2), true, e2), null)), w2 = t2, R2 = l2._closedPromise, T2 = () => (o2 ? E2() : q2(() => (function(e2) {
        const t3 = e2._ownerWritableStream, r3 = t3._state;
        return qt(t3) || "closed" === r3 ? c(void 0) : "errored" === r3 ? d(t3._storedError) : Bt(e2);
      })(s2)), null), "closed" === w2._state ? T2() : h(R2, T2), qt(r2) || "closed" === r2._state) {
        const e2 = new TypeError("the destination writable stream closed before all data could be piped to it");
        a2 ? E2(true, e2) : q2(() => Or(t2, e2), true, e2);
      }
      function C2() {
        const e2 = y2;
        return f(y2, () => e2 !== y2 ? C2() : void 0);
      }
      function P2(e2, t3, r3) {
        "errored" === e2._state ? r3(e2._storedError) : m(t3, r3);
      }
      function q2(e2, t3, o3) {
        function n3() {
          return b(e2(), () => O2(t3, o3), (e3) => O2(true, e3)), null;
        }
        _2 || (_2 = true, "writable" !== r2._state || qt(r2) ? n3() : h(C2(), n3));
      }
      function E2(e2, t3) {
        _2 || (_2 = true, "writable" !== r2._state || qt(r2) ? O2(e2, t3) : h(C2(), () => O2(e2, t3)));
      }
      function O2(e2, t3) {
        return At(s2), W(l2), void 0 !== i2 && i2.removeEventListener("abort", v2), e2 ? g2(t3) : S2(void 0), null;
      }
      p(u((t3, r3) => {
        !(function o3(n3) {
          n3 ? t3() : f(_2 ? c(true) : f(s2._readyPromise, () => u((t4, r4) => {
            K(l2, { _chunkSteps: (r5) => {
              y2 = f(zt(s2, r5), void 0, e), t4(false);
            }, _closeSteps: () => t4(true), _errorSteps: r4 });
          })), o3, r3);
        })(false);
      }));
    });
  }
  var ReadableStreamDefaultController = class {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get desiredSize() {
      if (!lr(this)) throw pr("desiredSize");
      return hr(this);
    }
    close() {
      if (!lr(this)) throw pr("close");
      if (!mr(this)) throw new TypeError("The stream is not in a state that permits close");
      dr(this);
    }
    enqueue(e2 = void 0) {
      if (!lr(this)) throw pr("enqueue");
      if (!mr(this)) throw new TypeError("The stream is not in a state that permits enqueue");
      return fr(this, e2);
    }
    error(e2 = void 0) {
      if (!lr(this)) throw pr("error");
      br(this, e2);
    }
    [T](e2) {
      we(this);
      const t2 = this._cancelAlgorithm(e2);
      return cr(this), t2;
    }
    [C](e2) {
      const t2 = this._controlledReadableStream;
      if (this._queue.length > 0) {
        const r2 = ge(this);
        this._closeRequested && 0 === this._queue.length ? (cr(this), Br(t2)) : sr(this), e2._chunkSteps(r2);
      } else V(t2, e2), sr(this);
    }
    [P]() {
    }
  };
  function lr(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableStream") && e2 instanceof ReadableStreamDefaultController);
  }
  function sr(e2) {
    if (!ur(e2)) return;
    if (e2._pulling) return void (e2._pullAgain = true);
    e2._pulling = true;
    b(e2._pullAlgorithm(), () => (e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, sr(e2)), null), (t2) => (br(e2, t2), null));
  }
  function ur(e2) {
    const t2 = e2._controlledReadableStream;
    if (!mr(e2)) return false;
    if (!e2._started) return false;
    if (Wr(t2) && G(t2) > 0) return true;
    return hr(e2) > 0;
  }
  function cr(e2) {
    e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
  }
  function dr(e2) {
    if (!mr(e2)) return;
    const t2 = e2._controlledReadableStream;
    e2._closeRequested = true, 0 === e2._queue.length && (cr(e2), Br(t2));
  }
  function fr(e2, t2) {
    if (!mr(e2)) return;
    const r2 = e2._controlledReadableStream;
    if (Wr(r2) && G(r2) > 0) U(r2, t2, false);
    else {
      let r3;
      try {
        r3 = e2._strategySizeAlgorithm(t2);
      } catch (t3) {
        throw br(e2, t3), t3;
      }
      try {
        ve(e2, t2, r3);
      } catch (t3) {
        throw br(e2, t3), t3;
      }
    }
    sr(e2);
  }
  function br(e2, t2) {
    const r2 = e2._controlledReadableStream;
    "readable" === r2._state && (we(e2), cr(e2), kr(r2, t2));
  }
  function hr(e2) {
    const t2 = e2._controlledReadableStream._state;
    return "errored" === t2 ? null : "closed" === t2 ? 0 : e2._strategyHWM - e2._queueTotalSize;
  }
  function mr(e2) {
    const t2 = e2._controlledReadableStream._state;
    return !e2._closeRequested && "readable" === t2;
  }
  function _r(e2, t2, r2, o2, n2, a2, i2) {
    t2._controlledReadableStream = e2, t2._queue = void 0, t2._queueTotalSize = void 0, we(t2), t2._started = false, t2._closeRequested = false, t2._pullAgain = false, t2._pulling = false, t2._strategySizeAlgorithm = i2, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, e2._readableStreamController = t2;
    b(c(r2()), () => (t2._started = true, sr(t2), null), (e3) => (br(t2, e3), null));
  }
  function pr(e2) {
    return new TypeError(`ReadableStreamDefaultController.prototype.${e2} can only be used on a ReadableStreamDefaultController`);
  }
  function yr(e2, t2) {
    return Te(e2._readableStreamController) ? (function(e3) {
      let t3, r2, o2, n2, a2, i2 = H(e3), l2 = false, s2 = false, d2 = false, f2 = false, b2 = false;
      const h2 = u((e4) => {
        a2 = e4;
      });
      function _2(e4) {
        m(e4._closedPromise, (t4) => (e4 !== i2 || (Ne(o2._readableStreamController, t4), Ne(n2._readableStreamController, t4), f2 && b2 || a2(void 0)), null));
      }
      function p2() {
        at(i2) && (W(i2), i2 = H(e3), _2(i2));
        K(i2, { _chunkSteps: (t4) => {
          y(() => {
            s2 = false, d2 = false;
            const r3 = t4;
            let i3 = t4;
            if (!f2 && !b2) try {
              i3 = Se(t4);
            } catch (t5) {
              return Ne(o2._readableStreamController, t5), Ne(n2._readableStreamController, t5), void a2(Or(e3, t5));
            }
            f2 || Qe(o2._readableStreamController, r3), b2 || Qe(n2._readableStreamController, i3), l2 = false, s2 ? g2() : d2 && v2();
          });
        }, _closeSteps: () => {
          l2 = false, f2 || xe(o2._readableStreamController), b2 || xe(n2._readableStreamController), o2._readableStreamController._pendingPullIntos.length > 0 && Ge(o2._readableStreamController, 0), n2._readableStreamController._pendingPullIntos.length > 0 && Ge(n2._readableStreamController, 0), f2 && b2 || a2(void 0);
        }, _errorSteps: () => {
          l2 = false;
        } });
      }
      function S2(t4, r3) {
        J(i2) && (W(i2), i2 = tt(e3), _2(i2));
        const u2 = r3 ? n2 : o2, c2 = r3 ? o2 : n2;
        it(i2, t4, 1, { _chunkSteps: (t5) => {
          y(() => {
            s2 = false, d2 = false;
            const o3 = r3 ? b2 : f2;
            if (r3 ? f2 : b2) o3 || Xe(u2._readableStreamController, t5);
            else {
              let r4;
              try {
                r4 = Se(t5);
              } catch (t6) {
                return Ne(u2._readableStreamController, t6), Ne(c2._readableStreamController, t6), void a2(Or(e3, t6));
              }
              o3 || Xe(u2._readableStreamController, t5), Qe(c2._readableStreamController, r4);
            }
            l2 = false, s2 ? g2() : d2 && v2();
          });
        }, _closeSteps: (e4) => {
          l2 = false;
          const t5 = r3 ? b2 : f2, o3 = r3 ? f2 : b2;
          t5 || xe(u2._readableStreamController), o3 || xe(c2._readableStreamController), void 0 !== e4 && (t5 || Xe(u2._readableStreamController, e4), !o3 && c2._readableStreamController._pendingPullIntos.length > 0 && Ge(c2._readableStreamController, 0)), t5 && o3 || a2(void 0);
        }, _errorSteps: () => {
          l2 = false;
        } });
      }
      function g2() {
        if (l2) return s2 = true, c(void 0);
        l2 = true;
        const e4 = Ve(o2._readableStreamController);
        return null === e4 ? p2() : S2(e4._view, false), c(void 0);
      }
      function v2() {
        if (l2) return d2 = true, c(void 0);
        l2 = true;
        const e4 = Ve(n2._readableStreamController);
        return null === e4 ? p2() : S2(e4._view, true), c(void 0);
      }
      function w2(o3) {
        if (f2 = true, t3 = o3, b2) {
          const o4 = ne([t3, r2]), n3 = Or(e3, o4);
          a2(n3);
        }
        return h2;
      }
      function R2(o3) {
        if (b2 = true, r2 = o3, f2) {
          const o4 = ne([t3, r2]), n3 = Or(e3, o4);
          a2(n3);
        }
        return h2;
      }
      function T2() {
      }
      return o2 = Pr(T2, g2, w2), n2 = Pr(T2, v2, R2), _2(i2), [o2, n2];
    })(e2) : (function(e3) {
      const t3 = H(e3);
      let r2, o2, n2, a2, i2, l2 = false, s2 = false, d2 = false, f2 = false;
      const b2 = u((e4) => {
        i2 = e4;
      });
      function h2() {
        if (l2) return s2 = true, c(void 0);
        l2 = true;
        return K(t3, { _chunkSteps: (e4) => {
          y(() => {
            s2 = false;
            const t4 = e4, r3 = e4;
            d2 || fr(n2._readableStreamController, t4), f2 || fr(a2._readableStreamController, r3), l2 = false, s2 && h2();
          });
        }, _closeSteps: () => {
          l2 = false, d2 || dr(n2._readableStreamController), f2 || dr(a2._readableStreamController), d2 && f2 || i2(void 0);
        }, _errorSteps: () => {
          l2 = false;
        } }), c(void 0);
      }
      function _2(t4) {
        if (d2 = true, r2 = t4, f2) {
          const t5 = ne([r2, o2]), n3 = Or(e3, t5);
          i2(n3);
        }
        return b2;
      }
      function p2(t4) {
        if (f2 = true, o2 = t4, d2) {
          const t5 = ne([r2, o2]), n3 = Or(e3, t5);
          i2(n3);
        }
        return b2;
      }
      function S2() {
      }
      return n2 = Cr(S2, h2, _2), a2 = Cr(S2, h2, p2), m(t3._closedPromise, (e4) => (br(n2._readableStreamController, e4), br(a2._readableStreamController, e4), d2 && f2 || i2(void 0), null)), [n2, a2];
    })(e2);
  }
  function Sr(r2) {
    return t(o2 = r2) && void 0 !== o2.getReader ? (function(r3) {
      let o3;
      function n2() {
        let e2;
        try {
          e2 = r3.read();
        } catch (e3) {
          return d(e3);
        }
        return _(e2, (e3) => {
          if (!t(e3)) throw new TypeError("The promise returned by the reader.read() method must fulfill with an object");
          if (e3.done) dr(o3._readableStreamController);
          else {
            const t2 = e3.value;
            fr(o3._readableStreamController, t2);
          }
        });
      }
      function a2(e2) {
        try {
          return c(r3.cancel(e2));
        } catch (e3) {
          return d(e3);
        }
      }
      return o3 = Cr(e, n2, a2, 0), o3;
    })(r2.getReader()) : (function(r3) {
      let o3;
      const n2 = fe(r3, "async");
      function a2() {
        let e2;
        try {
          e2 = be(n2);
        } catch (e3) {
          return d(e3);
        }
        return _(c(e2), (e3) => {
          if (!t(e3)) throw new TypeError("The promise returned by the iterator.next() method must fulfill with an object");
          if (e3.done) dr(o3._readableStreamController);
          else {
            const t2 = e3.value;
            fr(o3._readableStreamController, t2);
          }
        });
      }
      function i2(e2) {
        const r4 = n2.iterator;
        let o4;
        try {
          o4 = ue(r4, "return");
        } catch (e3) {
          return d(e3);
        }
        if (void 0 === o4) return c(void 0);
        return _(g(o4, r4, [e2]), (e3) => {
          if (!t(e3)) throw new TypeError("The promise returned by the iterator.return() method must fulfill with an object");
        });
      }
      return o3 = Cr(e, a2, i2, 0), o3;
    })(r2);
    var o2;
  }
  function gr(e2, t2, r2) {
    return F(e2, r2), (r3) => g(e2, t2, [r3]);
  }
  function vr(e2, t2, r2) {
    return F(e2, r2), (r3) => g(e2, t2, [r3]);
  }
  function wr(e2, t2, r2) {
    return F(e2, r2), (r3) => S(e2, t2, [r3]);
  }
  function Rr(e2, t2) {
    if ("bytes" !== (e2 = `${e2}`)) throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamType`);
    return e2;
  }
  function Tr(e2, t2) {
    L(e2, t2);
    const r2 = null == e2 ? void 0 : e2.preventAbort, o2 = null == e2 ? void 0 : e2.preventCancel, n2 = null == e2 ? void 0 : e2.preventClose, a2 = null == e2 ? void 0 : e2.signal;
    return void 0 !== a2 && (function(e3, t3) {
      if (!(function(e4) {
        if ("object" != typeof e4 || null === e4) return false;
        try {
          return "boolean" == typeof e4.aborted;
        } catch (e5) {
          return false;
        }
      })(e3)) throw new TypeError(`${t3} is not an AbortSignal.`);
    })(a2, `${t2} has member 'signal' that`), { preventAbort: Boolean(r2), preventCancel: Boolean(o2), preventClose: Boolean(n2), signal: a2 };
  }
  Object.defineProperties(ReadableStreamDefaultController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, desiredSize: { enumerable: true } }), o(ReadableStreamDefaultController.prototype.close, "close"), o(ReadableStreamDefaultController.prototype.enqueue, "enqueue"), o(ReadableStreamDefaultController.prototype.error, "error"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStreamDefaultController.prototype, Symbol.toStringTag, { value: "ReadableStreamDefaultController", configurable: true });
  var ReadableStream = class {
    constructor(e2 = {}, t2 = {}) {
      void 0 === e2 ? e2 = null : I(e2, "First parameter");
      const r2 = dt(t2, "Second parameter"), o2 = (function(e3, t3) {
        L(e3, t3);
        const r3 = e3, o3 = null == r3 ? void 0 : r3.autoAllocateChunkSize, n2 = null == r3 ? void 0 : r3.cancel, a2 = null == r3 ? void 0 : r3.pull, i2 = null == r3 ? void 0 : r3.start, l2 = null == r3 ? void 0 : r3.type;
        return { autoAllocateChunkSize: void 0 === o3 ? void 0 : Q(o3, `${t3} has member 'autoAllocateChunkSize' that`), cancel: void 0 === n2 ? void 0 : gr(n2, r3, `${t3} has member 'cancel' that`), pull: void 0 === a2 ? void 0 : vr(a2, r3, `${t3} has member 'pull' that`), start: void 0 === i2 ? void 0 : wr(i2, r3, `${t3} has member 'start' that`), type: void 0 === l2 ? void 0 : Rr(l2, `${t3} has member 'type' that`) };
      })(e2, "First parameter");
      if (qr(this), "bytes" === o2.type) {
        if (void 0 !== r2.size) throw new RangeError("The strategy for a byte stream cannot have a size function");
        !(function(e3, t3, r3) {
          const o3 = Object.create(ReadableByteStreamController.prototype);
          let n2, a2, i2;
          n2 = void 0 !== t3.start ? () => t3.start(o3) : () => {
          }, a2 = void 0 !== t3.pull ? () => t3.pull(o3) : () => c(void 0), i2 = void 0 !== t3.cancel ? (e4) => t3.cancel(e4) : () => c(void 0);
          const l2 = t3.autoAllocateChunkSize;
          if (0 === l2) throw new TypeError("autoAllocateChunkSize must be greater than 0");
          Je(e3, o3, n2, a2, i2, r3, l2);
        })(this, o2, ut(r2, 0));
      } else {
        const e3 = ct(r2);
        !(function(e4, t3, r3, o3) {
          const n2 = Object.create(ReadableStreamDefaultController.prototype);
          let a2, i2, l2;
          a2 = void 0 !== t3.start ? () => t3.start(n2) : () => {
          }, i2 = void 0 !== t3.pull ? () => t3.pull(n2) : () => c(void 0), l2 = void 0 !== t3.cancel ? (e5) => t3.cancel(e5) : () => c(void 0), _r(e4, n2, a2, i2, l2, r3, o3);
        })(this, o2, ut(r2, 1), e3);
      }
    }
    get locked() {
      if (!Er(this)) throw jr("locked");
      return Wr(this);
    }
    cancel(e2 = void 0) {
      return Er(this) ? Wr(this) ? d(new TypeError("Cannot cancel a stream that already has a reader")) : Or(this, e2) : d(jr("cancel"));
    }
    getReader(e2 = void 0) {
      if (!Er(this)) throw jr("getReader");
      return void 0 === (function(e3, t2) {
        L(e3, t2);
        const r2 = null == e3 ? void 0 : e3.mode;
        return { mode: void 0 === r2 ? void 0 : et(r2, `${t2} has member 'mode' that`) };
      })(e2, "First parameter").mode ? H(this) : tt(this);
    }
    pipeThrough(e2, t2 = {}) {
      if (!Er(this)) throw jr("pipeThrough");
      $(e2, 1, "pipeThrough");
      const r2 = (function(e3, t3) {
        L(e3, t3);
        const r3 = null == e3 ? void 0 : e3.readable;
        M(r3, "readable", "ReadableWritablePair"), N(r3, `${t3} has member 'readable' that`);
        const o3 = null == e3 ? void 0 : e3.writable;
        return M(o3, "writable", "ReadableWritablePair"), pt(o3, `${t3} has member 'writable' that`), { readable: r3, writable: o3 };
      })(e2, "First parameter"), o2 = Tr(t2, "Second parameter");
      if (Wr(this)) throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");
      if (vt(r2.writable)) throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");
      return p(ir(this, r2.writable, o2.preventClose, o2.preventAbort, o2.preventCancel, o2.signal)), r2.readable;
    }
    pipeTo(e2, t2 = {}) {
      if (!Er(this)) return d(jr("pipeTo"));
      if (void 0 === e2) return d("Parameter 1 is required in 'pipeTo'.");
      if (!gt(e2)) return d(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream"));
      let r2;
      try {
        r2 = Tr(t2, "Second parameter");
      } catch (e3) {
        return d(e3);
      }
      return Wr(this) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream")) : vt(e2) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream")) : ir(this, e2, r2.preventClose, r2.preventAbort, r2.preventCancel, r2.signal);
    }
    tee() {
      if (!Er(this)) throw jr("tee");
      return ne(yr(this));
    }
    values(e2 = void 0) {
      if (!Er(this)) throw jr("values");
      return (function(e3, t2) {
        const r2 = H(e3), o2 = new he(r2, t2), n2 = Object.create(me);
        return n2._asyncIteratorImpl = o2, n2;
      })(this, (function(e3, t2) {
        L(e3, t2);
        const r2 = null == e3 ? void 0 : e3.preventCancel;
        return { preventCancel: Boolean(r2) };
      })(e2, "First parameter").preventCancel);
    }
    [de](e2) {
      return this.values(e2);
    }
    static from(e2) {
      return Sr(e2);
    }
  };
  function Cr(e2, t2, r2, o2 = 1, n2 = () => 1) {
    const a2 = Object.create(ReadableStream.prototype);
    qr(a2);
    return _r(a2, Object.create(ReadableStreamDefaultController.prototype), e2, t2, r2, o2, n2), a2;
  }
  function Pr(e2, t2, r2) {
    const o2 = Object.create(ReadableStream.prototype);
    qr(o2);
    return Je(o2, Object.create(ReadableByteStreamController.prototype), e2, t2, r2, 0, void 0), o2;
  }
  function qr(e2) {
    e2._state = "readable", e2._reader = void 0, e2._storedError = void 0, e2._disturbed = false;
  }
  function Er(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readableStreamController") && e2 instanceof ReadableStream);
  }
  function Wr(e2) {
    return void 0 !== e2._reader;
  }
  function Or(t2, r2) {
    if (t2._disturbed = true, "closed" === t2._state) return c(void 0);
    if ("errored" === t2._state) return d(t2._storedError);
    Br(t2);
    const o2 = t2._reader;
    if (void 0 !== o2 && at(o2)) {
      const e2 = o2._readIntoRequests;
      o2._readIntoRequests = new v(), e2.forEach((e3) => {
        e3._closeSteps(void 0);
      });
    }
    return _(t2._readableStreamController[T](r2), e);
  }
  function Br(e2) {
    e2._state = "closed";
    const t2 = e2._reader;
    if (void 0 !== t2 && (A(t2), J(t2))) {
      const e3 = t2._readRequests;
      t2._readRequests = new v(), e3.forEach((e4) => {
        e4._closeSteps();
      });
    }
  }
  function kr(e2, t2) {
    e2._state = "errored", e2._storedError = t2;
    const r2 = e2._reader;
    void 0 !== r2 && (j(r2, t2), J(r2) ? Z(r2, t2) : lt(r2, t2));
  }
  function jr(e2) {
    return new TypeError(`ReadableStream.prototype.${e2} can only be used on a ReadableStream`);
  }
  function Ar(e2, t2) {
    L(e2, t2);
    const r2 = null == e2 ? void 0 : e2.highWaterMark;
    return M(r2, "highWaterMark", "QueuingStrategyInit"), { highWaterMark: Y(r2) };
  }
  Object.defineProperties(ReadableStream, { from: { enumerable: true } }), Object.defineProperties(ReadableStream.prototype, { cancel: { enumerable: true }, getReader: { enumerable: true }, pipeThrough: { enumerable: true }, pipeTo: { enumerable: true }, tee: { enumerable: true }, values: { enumerable: true }, locked: { enumerable: true } }), o(ReadableStream.from, "from"), o(ReadableStream.prototype.cancel, "cancel"), o(ReadableStream.prototype.getReader, "getReader"), o(ReadableStream.prototype.pipeThrough, "pipeThrough"), o(ReadableStream.prototype.pipeTo, "pipeTo"), o(ReadableStream.prototype.tee, "tee"), o(ReadableStream.prototype.values, "values"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ReadableStream.prototype, Symbol.toStringTag, { value: "ReadableStream", configurable: true }), Object.defineProperty(ReadableStream.prototype, de, { value: ReadableStream.prototype.values, writable: true, configurable: true });
  var zr = (e2) => e2.byteLength;
  o(zr, "size");
  var ByteLengthQueuingStrategy = class {
    constructor(e2) {
      $(e2, 1, "ByteLengthQueuingStrategy"), e2 = Ar(e2, "First parameter"), this._byteLengthQueuingStrategyHighWaterMark = e2.highWaterMark;
    }
    get highWaterMark() {
      if (!Lr(this)) throw Dr("highWaterMark");
      return this._byteLengthQueuingStrategyHighWaterMark;
    }
    get size() {
      if (!Lr(this)) throw Dr("size");
      return zr;
    }
  };
  function Dr(e2) {
    return new TypeError(`ByteLengthQueuingStrategy.prototype.${e2} can only be used on a ByteLengthQueuingStrategy`);
  }
  function Lr(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_byteLengthQueuingStrategyHighWaterMark") && e2 instanceof ByteLengthQueuingStrategy);
  }
  Object.defineProperties(ByteLengthQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(ByteLengthQueuingStrategy.prototype, Symbol.toStringTag, { value: "ByteLengthQueuingStrategy", configurable: true });
  var Fr = () => 1;
  o(Fr, "size");
  var CountQueuingStrategy = class {
    constructor(e2) {
      $(e2, 1, "CountQueuingStrategy"), e2 = Ar(e2, "First parameter"), this._countQueuingStrategyHighWaterMark = e2.highWaterMark;
    }
    get highWaterMark() {
      if (!$r(this)) throw Ir("highWaterMark");
      return this._countQueuingStrategyHighWaterMark;
    }
    get size() {
      if (!$r(this)) throw Ir("size");
      return Fr;
    }
  };
  function Ir(e2) {
    return new TypeError(`CountQueuingStrategy.prototype.${e2} can only be used on a CountQueuingStrategy`);
  }
  function $r(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_countQueuingStrategyHighWaterMark") && e2 instanceof CountQueuingStrategy);
  }
  function Mr(e2, t2, r2) {
    return F(e2, r2), (r3) => g(e2, t2, [r3]);
  }
  function Yr(e2, t2, r2) {
    return F(e2, r2), (r3) => S(e2, t2, [r3]);
  }
  function xr(e2, t2, r2) {
    return F(e2, r2), (r3, o2) => g(e2, t2, [r3, o2]);
  }
  function Qr(e2, t2, r2) {
    return F(e2, r2), (r3) => g(e2, t2, [r3]);
  }
  Object.defineProperties(CountQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(CountQueuingStrategy.prototype, Symbol.toStringTag, { value: "CountQueuingStrategy", configurable: true });
  var TransformStream = class {
    constructor(e2 = {}, t2 = {}, r2 = {}) {
      void 0 === e2 && (e2 = null);
      const o2 = dt(t2, "Second parameter"), n2 = dt(r2, "Third parameter"), a2 = (function(e3, t3) {
        L(e3, t3);
        const r3 = null == e3 ? void 0 : e3.cancel, o3 = null == e3 ? void 0 : e3.flush, n3 = null == e3 ? void 0 : e3.readableType, a3 = null == e3 ? void 0 : e3.start, i3 = null == e3 ? void 0 : e3.transform, l3 = null == e3 ? void 0 : e3.writableType;
        return { cancel: void 0 === r3 ? void 0 : Qr(r3, e3, `${t3} has member 'cancel' that`), flush: void 0 === o3 ? void 0 : Mr(o3, e3, `${t3} has member 'flush' that`), readableType: n3, start: void 0 === a3 ? void 0 : Yr(a3, e3, `${t3} has member 'start' that`), transform: void 0 === i3 ? void 0 : xr(i3, e3, `${t3} has member 'transform' that`), writableType: l3 };
      })(e2, "First parameter");
      if (void 0 !== a2.readableType) throw new RangeError("Invalid readableType specified");
      if (void 0 !== a2.writableType) throw new RangeError("Invalid writableType specified");
      const i2 = ut(n2, 0), l2 = ct(n2), s2 = ut(o2, 1), f2 = ct(o2);
      let h2;
      !(function(e3, t3, r3, o3, n3, a3) {
        function i3() {
          return t3;
        }
        function l3(t4) {
          return (function(e4, t5) {
            const r4 = e4._transformStreamController;
            if (e4._backpressure) {
              return _(e4._backpressureChangePromise, () => {
                const o4 = e4._writable;
                if ("erroring" === o4._state) throw o4._storedError;
                return Zr(r4, t5);
              });
            }
            return Zr(r4, t5);
          })(e3, t4);
        }
        function s3(t4) {
          return (function(e4, t5) {
            const r4 = e4._transformStreamController;
            if (void 0 !== r4._finishPromise) return r4._finishPromise;
            const o4 = e4._readable;
            r4._finishPromise = u((e5, t6) => {
              r4._finishPromise_resolve = e5, r4._finishPromise_reject = t6;
            });
            const n4 = r4._cancelAlgorithm(t5);
            return Jr(r4), b(n4, () => ("errored" === o4._state ? ro(r4, o4._storedError) : (br(o4._readableStreamController, t5), to(r4)), null), (e5) => (br(o4._readableStreamController, e5), ro(r4, e5), null)), r4._finishPromise;
          })(e3, t4);
        }
        function c2() {
          return (function(e4) {
            const t4 = e4._transformStreamController;
            if (void 0 !== t4._finishPromise) return t4._finishPromise;
            const r4 = e4._readable;
            t4._finishPromise = u((e5, r5) => {
              t4._finishPromise_resolve = e5, t4._finishPromise_reject = r5;
            });
            const o4 = t4._flushAlgorithm();
            return Jr(t4), b(o4, () => ("errored" === r4._state ? ro(t4, r4._storedError) : (dr(r4._readableStreamController), to(t4)), null), (e5) => (br(r4._readableStreamController, e5), ro(t4, e5), null)), t4._finishPromise;
          })(e3);
        }
        function d2() {
          return (function(e4) {
            return Gr(e4, false), e4._backpressureChangePromise;
          })(e3);
        }
        function f3(t4) {
          return (function(e4, t5) {
            const r4 = e4._transformStreamController;
            if (void 0 !== r4._finishPromise) return r4._finishPromise;
            const o4 = e4._writable;
            r4._finishPromise = u((e5, t6) => {
              r4._finishPromise_resolve = e5, r4._finishPromise_reject = t6;
            });
            const n4 = r4._cancelAlgorithm(t5);
            return Jr(r4), b(n4, () => ("errored" === o4._state ? ro(r4, o4._storedError) : (Yt(o4._writableStreamController, t5), Ur(e4), to(r4)), null), (t6) => (Yt(o4._writableStreamController, t6), Ur(e4), ro(r4, t6), null)), r4._finishPromise;
          })(e3, t4);
        }
        e3._writable = (function(e4, t4, r4, o4, n4 = 1, a4 = () => 1) {
          const i4 = Object.create(WritableStream.prototype);
          return St(i4), Ft(i4, Object.create(WritableStreamDefaultController.prototype), e4, t4, r4, o4, n4, a4), i4;
        })(i3, l3, c2, s3, r3, o3), e3._readable = Cr(i3, d2, f3, n3, a3), e3._backpressure = void 0, e3._backpressureChangePromise = void 0, e3._backpressureChangePromise_resolve = void 0, Gr(e3, true), e3._transformStreamController = void 0;
      })(this, u((e3) => {
        h2 = e3;
      }), s2, f2, i2, l2), (function(e3, t3) {
        const r3 = Object.create(TransformStreamDefaultController.prototype);
        let o3, n3, a3;
        o3 = void 0 !== t3.transform ? (e4) => t3.transform(e4, r3) : (e4) => {
          try {
            return Kr(r3, e4), c(void 0);
          } catch (e5) {
            return d(e5);
          }
        };
        n3 = void 0 !== t3.flush ? () => t3.flush(r3) : () => c(void 0);
        a3 = void 0 !== t3.cancel ? (e4) => t3.cancel(e4) : () => c(void 0);
        !(function(e4, t4, r4, o4, n4) {
          t4._controlledTransformStream = e4, e4._transformStreamController = t4, t4._transformAlgorithm = r4, t4._flushAlgorithm = o4, t4._cancelAlgorithm = n4, t4._finishPromise = void 0, t4._finishPromise_resolve = void 0, t4._finishPromise_reject = void 0;
        })(e3, r3, o3, n3, a3);
      })(this, a2), void 0 !== a2.start ? h2(a2.start(this._transformStreamController)) : h2(void 0);
    }
    get readable() {
      if (!Nr(this)) throw oo("readable");
      return this._readable;
    }
    get writable() {
      if (!Nr(this)) throw oo("writable");
      return this._writable;
    }
  };
  function Nr(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_transformStreamController") && e2 instanceof TransformStream);
  }
  function Hr(e2, t2) {
    br(e2._readable._readableStreamController, t2), Vr(e2, t2);
  }
  function Vr(e2, t2) {
    Jr(e2._transformStreamController), Yt(e2._writable._writableStreamController, t2), Ur(e2);
  }
  function Ur(e2) {
    e2._backpressure && Gr(e2, false);
  }
  function Gr(e2, t2) {
    void 0 !== e2._backpressureChangePromise && e2._backpressureChangePromise_resolve(), e2._backpressureChangePromise = u((t3) => {
      e2._backpressureChangePromise_resolve = t3;
    }), e2._backpressure = t2;
  }
  Object.defineProperties(TransformStream.prototype, { readable: { enumerable: true }, writable: { enumerable: true } }), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(TransformStream.prototype, Symbol.toStringTag, { value: "TransformStream", configurable: true });
  var TransformStreamDefaultController = class {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get desiredSize() {
      if (!Xr(this)) throw eo("desiredSize");
      return hr(this._controlledTransformStream._readable._readableStreamController);
    }
    enqueue(e2 = void 0) {
      if (!Xr(this)) throw eo("enqueue");
      Kr(this, e2);
    }
    error(e2 = void 0) {
      if (!Xr(this)) throw eo("error");
      var t2;
      t2 = e2, Hr(this._controlledTransformStream, t2);
    }
    terminate() {
      if (!Xr(this)) throw eo("terminate");
      !(function(e2) {
        const t2 = e2._controlledTransformStream;
        dr(t2._readable._readableStreamController);
        const r2 = new TypeError("TransformStream terminated");
        Vr(t2, r2);
      })(this);
    }
  };
  function Xr(e2) {
    return !!t(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledTransformStream") && e2 instanceof TransformStreamDefaultController);
  }
  function Jr(e2) {
    e2._transformAlgorithm = void 0, e2._flushAlgorithm = void 0, e2._cancelAlgorithm = void 0;
  }
  function Kr(e2, t2) {
    const r2 = e2._controlledTransformStream, o2 = r2._readable._readableStreamController;
    if (!mr(o2)) throw new TypeError("Readable side is not in a state that permits enqueue");
    try {
      fr(o2, t2);
    } catch (e3) {
      throw Vr(r2, e3), r2._readable._storedError;
    }
    const n2 = (function(e3) {
      return !ur(e3);
    })(o2);
    n2 !== r2._backpressure && Gr(r2, true);
  }
  function Zr(e2, t2) {
    return _(e2._transformAlgorithm(t2), void 0, (t3) => {
      throw Hr(e2._controlledTransformStream, t3), t3;
    });
  }
  function eo(e2) {
    return new TypeError(`TransformStreamDefaultController.prototype.${e2} can only be used on a TransformStreamDefaultController`);
  }
  function to(e2) {
    void 0 !== e2._finishPromise_resolve && (e2._finishPromise_resolve(), e2._finishPromise_resolve = void 0, e2._finishPromise_reject = void 0);
  }
  function ro(e2, t2) {
    void 0 !== e2._finishPromise_reject && (p(e2._finishPromise), e2._finishPromise_reject(t2), e2._finishPromise_resolve = void 0, e2._finishPromise_reject = void 0);
  }
  function oo(e2) {
    return new TypeError(`TransformStream.prototype.${e2} can only be used on a TransformStream`);
  }
  Object.defineProperties(TransformStreamDefaultController.prototype, { enqueue: { enumerable: true }, error: { enumerable: true }, terminate: { enumerable: true }, desiredSize: { enumerable: true } }), o(TransformStreamDefaultController.prototype.enqueue, "enqueue"), o(TransformStreamDefaultController.prototype.error, "error"), o(TransformStreamDefaultController.prototype.terminate, "terminate"), "symbol" == typeof Symbol.toStringTag && Object.defineProperty(TransformStreamDefaultController.prototype, Symbol.toStringTag, { value: "TransformStreamDefaultController", configurable: true });

  // packages/core/runtime/node-globals.ts
  var bridge = globalThis.__bridge;
  delete globalThis.__bridge;
  var native = (kind, value) => {
    const result = JSON.parse(bridge(JSON.stringify({ kind, value })));
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  globalThis.__ceruBinary = {
    cipher(mode, algorithm, key, iv, options = {}) {
      const encode = (value) => typeof value === "string" ? value : import_buffer.Buffer.from(value).toString(options.encoding ?? "hex");
      const id = native("cipher.create", {
        mode,
        algorithm,
        key: encode(key),
        iv: encode(iv),
        encoding: options.encoding
      });
      let closed = false;
      const close = () => {
        if (!closed) {
          closed = true;
          native("cipher.close", id);
          options.signal?.removeEventListener("abort", abort);
        }
      };
      let controller;
      const abort = () => {
        close();
        controller?.error(Error("Cipher cancelled"));
      };
      const call = (kind, buffer) => {
        if (closed) throw Error("Cipher is closed");
        const value = bridge(JSON.stringify({ kind, value: id }), buffer);
        if (typeof value === "string") {
          const result = JSON.parse(value);
          throw Error(result.error ?? "Cipher failed");
        }
        return new Uint8Array(value);
      };
      const stream = new TransformStream({
        start(value) {
          controller = value;
          options.signal?.addEventListener("abort", abort, { once: true });
          if (options.signal?.aborted) abort();
        },
        transform(chunk, value) {
          if (!(chunk instanceof Uint8Array)) {
            close();
            throw Error("Cipher input must be Uint8Array");
          }
          try {
            for (let offset = 0; offset < chunk.length; offset += 1024 * 1024) {
              const bytes = chunk.subarray(offset, offset + 1024 * 1024);
              const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : Uint8Array.from(bytes).buffer;
              const result = call("cipher.update", buffer);
              if (result.length) value.enqueue(result);
            }
          } catch (error) {
            close();
            throw error;
          }
        },
        flush(value) {
          try {
            const result = call("cipher.final");
            if (result.length) value.enqueue(result);
          } finally {
            close();
          }
        },
        cancel() {
          close();
        }
      });
      return stream;
    },
    take(id) {
      const bytes = bridge(JSON.stringify({ kind: "stream.take", value: id }));
      return new Uint8Array(bytes);
    },
    httpSend(value, bytes = new Uint8Array()) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024)
        throw Error("HTTP chunk exceeds 1 MiB");
      const buffer = Uint8Array.from(bytes).buffer;
      const result = JSON.parse(bridge(JSON.stringify({ kind: "http.send", value }), buffer));
      if (result.error) throw Error(result.error);
    },
    send(id, bytes, error) {
      if (bytes !== void 0 && (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024))
        throw Error("Invalid stream output");
      const buffer = bytes === void 0 ? new ArrayBuffer(0) : bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : Uint8Array.from(bytes).buffer;
      const result = JSON.parse(
        bridge(JSON.stringify({ kind: "stream.send", value: { id, error } }), buffer)
      );
      if (result.error) throw Error(result.error);
    }
  };
  var listeners = /* @__PURE__ */ new Set();
  var timers = /* @__PURE__ */ new Map();
  var timerSequence = 0;
  var SafeURLSearchParams = class {
    constructor(value = "", changed) {
      this.changed = changed;
      this.query = native("params", { value, method: "toString", args: [] });
    }
    changed;
    query;
    call(method, ...args) {
      const result = native("params", { value: this.query, method, args });
      if (["append", "delete", "set", "sort"].includes(method)) {
        this.query = result;
        this.changed?.(result);
      }
      return result;
    }
    get(key) {
      return this.call("get", key);
    }
    getAll(key) {
      return this.call("getAll", key);
    }
    has(key) {
      return this.call("has", key);
    }
    append(key, value) {
      this.call("append", key, value);
    }
    set(key, value) {
      this.call("set", key, value);
    }
    delete(key) {
      this.call("delete", key);
    }
    sort() {
      this.call("sort");
    }
    entries() {
      return this.call("entries")[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entries();
    }
    forEach(fn) {
      for (const [key, value] of this.entries()) fn(value, key, this);
    }
    toString() {
      return this.query;
    }
  };
  var SafeURL = class {
    value;
    constructor(url, base) {
      this.value = native("url", {
        url: String(url),
        base: base === void 0 ? void 0 : String(base)
      });
    }
    get href() {
      return this.value.href;
    }
    set href(value) {
      this.value = native("url", { url: value });
    }
    get origin() {
      return this.value.origin;
    }
    get protocol() {
      return this.value.protocol;
    }
    get hostname() {
      return this.value.hostname;
    }
    get host() {
      return this.value.host;
    }
    get port() {
      return this.value.port;
    }
    get username() {
      return this.value.username;
    }
    get password() {
      return this.value.password;
    }
    get pathname() {
      return this.value.pathname;
    }
    get hash() {
      return this.value.hash;
    }
    get search() {
      return this.value.search;
    }
    get searchParams() {
      return new SafeURLSearchParams(this.value.search, (query) => {
        this.value = native("url", { url: this.href, search: query });
      });
    }
    toString() {
      return this.href;
    }
    toJSON() {
      return this.href;
    }
  };
  var SafeAbortSignal = class {
    aborted = false;
    reason;
    listeners = /* @__PURE__ */ new Set();
    addEventListener(name, listener) {
      if (name === "abort") this.listeners.add(listener);
    }
    removeEventListener(_name, listener) {
      this.listeners.delete(listener);
    }
    throwIfAborted() {
      if (this.aborted) throw this.reason;
    }
    abort(reason = new Error("Operation aborted")) {
      if (this.aborted) return;
      this.aborted = true;
      this.reason = reason;
      for (const listener of this.listeners) listener({ type: "abort" });
      this.listeners.clear();
    }
  };
  var SafeHeaders = class {
    fields = /* @__PURE__ */ new Map();
    constructor(init) {
      if (init == null) return;
      if (typeof init[Symbol.iterator] === "function") {
        for (const pair of init) {
          if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError("Invalid header pair");
          this.append(pair[0], pair[1]);
        }
      } else for (const key of Object.keys(init)) this.append(key, init[key]);
    }
    name(value) {
      const name = String(value).toLowerCase();
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) throw new TypeError("Invalid header name");
      return name;
    }
    value(value) {
      const text = String(value).replace(/^[\t ]+|[\t ]+$/g, "");
      if (/[\r\n\0]/.test(text) || [...text].some((char) => char.charCodeAt(0) > 255))
        throw new TypeError("Invalid header value");
      return text;
    }
    append(name, value) {
      const key = this.name(name), text = this.value(value);
      this.fields.set(key, [...this.fields.get(key) ?? [], text]);
    }
    set(name, value) {
      this.fields.set(this.name(name), [this.value(value)]);
    }
    get(name) {
      return this.fields.get(this.name(name))?.join(", ") ?? null;
    }
    has(name) {
      return this.fields.has(this.name(name));
    }
    delete(name) {
      this.fields.delete(this.name(name));
    }
    getSetCookie() {
      return [...this.fields.get("set-cookie") ?? []];
    }
    *entries() {
      for (const name of [...this.fields.keys()].sort()) {
        for (const value of name === "set-cookie" ? this.fields.get(name) : [this.get(name)])
          yield [name, value];
      }
    }
    *keys() {
      for (const [key] of this.entries()) yield key;
    }
    *values() {
      for (const [, value] of this.entries()) yield value;
    }
    [Symbol.iterator]() {
      return this.entries();
    }
    forEach(callback, thisArg) {
      for (const [key, value] of this) callback.call(thisArg, value, key, this);
    }
  };
  var SafeBody = class {
    body;
    consumed = false;
    constructor(value, headers) {
      if (value == null) this.body = null;
      else if (value instanceof ReadableStream) this.body = value;
      else {
        let bytes;
        if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
        else if (ArrayBuffer.isView(value))
          bytes = Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        else if (typeof value === "string" || value instanceof SafeURLSearchParams) {
          bytes = Uint8Array.from(import_buffer.Buffer.from(String(value), "utf8"));
          if (!headers.has("content-type"))
            headers.set(
              "content-type",
              value instanceof SafeURLSearchParams ? "application/x-www-form-urlencoded;charset=UTF-8" : "text/plain;charset=UTF-8"
            );
        } else throw new TypeError("Unsupported HTTP body");
        this.body = new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          }
        });
      }
    }
    get bodyUsed() {
      return this.consumed || !!this.body?.locked;
    }
    async arrayBuffer() {
      if (this.bodyUsed) throw new TypeError("Body already used");
      this.consumed = true;
      if (!this.body) return new ArrayBuffer(0);
      const reader = this.body.getReader(), chunks = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!(value instanceof Uint8Array)) throw new TypeError("Body must contain bytes");
          chunks.push(value);
          size += value.byteLength;
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes.buffer;
    }
    async bytes() {
      return new Uint8Array(await this.arrayBuffer());
    }
    async text() {
      return import_buffer.Buffer.from(await this.arrayBuffer()).toString("utf8");
    }
    async json() {
      return JSON.parse(await this.text());
    }
    split() {
      if (this.bodyUsed) throw new TypeError("Body already used");
      if (!this.body) return null;
      const [original, clone] = this.body.tee();
      Object.defineProperty(this, "body", { value: original, configurable: true });
      return clone;
    }
  };
  var SafeRequest = class _SafeRequest extends SafeBody {
    url;
    method;
    headers;
    signal;
    duplex = "half";
    constructor(input, init = {}) {
      const source = input instanceof _SafeRequest ? input : void 0;
      const headers = new SafeHeaders(init.headers ?? source?.headers);
      const method = String(init.method ?? source?.method ?? "GET");
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method) || /^(CONNECT|TRACE|TRACK)$/i.test(method))
        throw new TypeError("Invalid request method");
      const normalized = /^(DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method) ? method.toUpperCase() : method;
      const body = init.body !== void 0 ? init.body : source?.body;
      if (body != null && (normalized === "GET" || normalized === "HEAD"))
        throw new TypeError("GET/HEAD cannot have a body");
      super(body, headers);
      const url = new SafeURL(source?.url ?? String(input));
      if (url.username || url.password) throw new TypeError("Request URL contains credentials");
      this.url = url.href;
      this.method = normalized;
      this.headers = headers;
      this.signal = init.signal ?? source?.signal ?? new SafeAbortSignal();
    }
    clone() {
      return new _SafeRequest(this, { body: this.split() });
    }
  };
  var SafeResponse = class _SafeResponse extends SafeBody {
    headers;
    status;
    statusText;
    url = "";
    redirected = false;
    type = "default";
    constructor(body = null, init = {}) {
      const status = init.status ?? 200, headers = new SafeHeaders(init.headers);
      if (!Number.isInteger(status) || status < 200 || status > 599)
        throw new RangeError("Invalid response status");
      if (body != null && [204, 205, 304].includes(status))
        throw new TypeError("Response status forbids a body");
      if (/[^\t\x20-\x7e\x80-\xff]/.test(String(init.statusText ?? "")))
        throw new TypeError("Invalid status text");
      super(body, headers);
      this.headers = headers;
      this.status = status;
      this.statusText = String(init.statusText ?? "");
    }
    get ok() {
      return this.status >= 200 && this.status < 300;
    }
    clone() {
      return new _SafeResponse(this.split(), this);
    }
    static json(value, init = {}) {
      const headers = new SafeHeaders(init.headers);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      const text = JSON.stringify(value);
      if (text === void 0) throw new TypeError("Value is not JSON serializable");
      return new _SafeResponse(text, { ...init, headers });
    }
    static redirect(url, status = 302) {
      if (![301, 302, 303, 307, 308].includes(status)) throw new RangeError("Invalid redirect status");
      return new _SafeResponse(null, { status, headers: { location: new SafeURL(url).href } });
    }
    static error() {
      const response = new _SafeResponse();
      Object.defineProperties(response, { status: { value: 0 }, type: { value: "error" } });
      return response;
    }
  };
  Object.assign(globalThis, {
    ReadableStream,
    WritableStream,
    TransformStream,
    Headers: SafeHeaders,
    Request: SafeRequest,
    Response: SafeResponse,
    URL: SafeURL,
    URLSearchParams: SafeURLSearchParams,
    AbortController: class {
      signal = new SafeAbortSignal();
      abort(reason) {
        this.signal.abort(reason);
      }
    },
    Buffer: import_buffer.Buffer,
    window: globalThis,
    self: globalThis,
    parent: { postMessage: (message) => native("message", message) },
    addEventListener: (name, listener) => {
      if (name === "message") listeners.add(listener);
    },
    btoa: (value) => import_buffer.Buffer.from(value, "binary").toString("base64"),
    atob: (value) => import_buffer.Buffer.from(value, "base64").toString("binary"),
    setTimeout: (callback, ms, ...args) => {
      const id = ++timerSequence;
      timers.set(id, { callback, args, repeat: false });
      native("timer", { id, ms, repeat: false });
      return id;
    },
    setInterval: (callback, ms, ...args) => {
      const id = ++timerSequence;
      timers.set(id, { callback, args, repeat: true });
      native("timer", { id, ms, repeat: true });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
      native("clearTimer", id);
    },
    clearInterval: (id) => {
      timers.delete(id);
      native("clearTimer", id);
    },
    TextEncoder: class {
      encode(value) {
        return Uint8Array.from(import_buffer.Buffer.from(value, "utf8"));
      }
    },
    TextDecoder: class {
      constructor(encoding = "utf-8") {
        this.encoding = encoding;
      }
      encoding;
      decode(value) {
        const bytes = ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : new Uint8Array(value ?? 0);
        return native("decode", { bytes: [...bytes], encoding: this.encoding });
      }
    },
    crypto: {
      getRandomValues: (value) => {
        const random = native("random", value.byteLength);
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength).set(random);
        return value;
      },
      randomUUID: () => native("uuid", null)
    },
    __receive: (encoded) => {
      const data = JSON.parse(encoded);
      if (data.type === "timer") {
        const timer = timers.get(data.id);
        if (timer) {
          if (!timer.repeat) timers.delete(data.id);
          timer.callback(...timer.args);
        }
        return;
      }
      for (const listener of listeners)
        Promise.resolve(listener({ source: globalThis.parent, data })).catch(
          (error) => native("message", { type: "log", data: { level: "error", values: [String(error)] } })
        );
    }
  });
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

web-streams-polyfill/dist/ponyfill.mjs:
  (**
   * @license
   * web-streams-polyfill v4.2.0
   * Copyright 2025 Mattias Buelens, Diwank Singh Tomer and other contributors.
   * This code is released under the MIT license.
   * SPDX-License-Identifier: MIT
   *)
*/
