"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * プロジェクト詳細ルーター
 */
const alverca = require("@chevre/domain");
const express = require("express");
const accountingReports_1 = require("../accountingReports");
const aggregateSales_1 = require("../aggregateSales");
const paymentReports_1 = require("../paymentReports");
const projectDetailRouter = express.Router();
projectDetailRouter.use((req, _, next) => {
    var _a;
    // プロジェクト未指定は拒否
    if (typeof ((_a = req.project) === null || _a === void 0 ? void 0 : _a.id) !== 'string') {
        next(new alverca.factory.errors.Forbidden('project not specified'));
        return;
    }
    next();
});
projectDetailRouter.use('/accountingReports', accountingReports_1.default);
projectDetailRouter.use('/aggregateSales', aggregateSales_1.default);
projectDetailRouter.use('/paymentReports', paymentReports_1.default);
exports.default = projectDetailRouter;
