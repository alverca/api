"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 売上レポートルーター
 */
const chevre = require("@chevre/domain");
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const mongoose = require("mongoose");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const aggregateSalesRouter = express_1.Router();
/**
 * 検索
 */
aggregateSalesRouter.get('', permitScopes_1.default(['admin']), ...[
    express_validator_1.query('limit')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('page')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$exists')
        .optional()
        .isBoolean()
        .toBoolean(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*[\'reservation.reservationFor.startDate\'].$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.dateRecorded.$lt')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('$and.*.orderDate.$lt')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (typeof ((_a = req.query) === null || _a === void 0 ? void 0 : _a.limit) === 'number') ? Math.min(req.query.limit, 100) : 100;
        const page = (typeof ((_b = req.query) === null || _b === void 0 ? void 0 : _b.page) === 'number') ? Math.max(req.query.page, 1) : 1;
        const reportRepo = new chevre.repository.Report(mongoose.connection);
        const andConditions = [
            { 'project.id': { $exists: true, $eq: (_c = req.project) === null || _c === void 0 ? void 0 : _c.id } }
        ];
        const $and = (_d = req.query) === null || _d === void 0 ? void 0 : _d.$and;
        if (Array.isArray($and)) {
            andConditions.push(...$and);
        }
        const reports = yield reportRepo.aggregateSaleModel.find((Array.isArray(andConditions) && andConditions.length > 0) ? { $and: andConditions } : {})
            .sort({ sortBy: 1 })
            .limit(limit)
            .skip(limit * (page - 1))
            .setOptions({ maxTimeMS: 10000 })
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
        res.json(reports);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = aggregateSalesRouter;
