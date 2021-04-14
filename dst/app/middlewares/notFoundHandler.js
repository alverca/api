"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 404ハンドラーミドルウェア
 */
const chevre = require("@chevre/domain");
exports.default = (req, __, next) => {
    next(new chevre.factory.errors.NotFound(`router for [${req.originalUrl}]`));
};
