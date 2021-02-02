"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 404ハンドラーミドルウェア
 */
const alverca = require("@alverca/domain");
exports.default = (req, __, next) => {
    next(new alverca.factory.errors.NotFound(`router for [${req.originalUrl}]`));
};
