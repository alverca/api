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
 * ウェブフックルーター
 */
const chevre = require("@chevre/domain");
const express = require("express");
const mongoose = require("mongoose");
const webhooksRouter = express.Router();
const http_status_1 = require("http-status");
/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post('/onOrderStatusChanged', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = req.body.data;
        const accountingReportRepo = new chevre.repository.AccountingReport(mongoose.connection);
        const orderRepo = new chevre.repository.Order(mongoose.connection);
        if (typeof (order === null || order === void 0 ? void 0 : order.orderNumber) === 'string') {
            yield chevre.service.webhook.onOrderStatusChanged(order)({ accountingReport: accountingReportRepo, order: orderRepo });
        }
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 予約使用アクション変更イベント
 */
webhooksRouter.post('/onActionStatusChanged', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const action 
        // tslint:disable-next-line:max-line-length
        = req.body.data;
        const reportRepo = new chevre.repository.Report(mongoose.connection);
        if (typeof (action === null || action === void 0 ? void 0 : action.typeOf) === 'string') {
            yield chevre.service.webhook.onActionStatusChanged(action)({ report: reportRepo });
        }
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 決済アクション受信
 */
webhooksRouter.post('/onPaymentStatusChanged', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const action 
        // tslint:disable-next-line:max-line-length
        = req.body.data;
        const accountingReportRepo = new chevre.repository.AccountingReport(mongoose.connection);
        // const actionRepo = new chevre.repository.Action(mongoose.connection);
        const orderRepo = new chevre.repository.Order(mongoose.connection);
        const reportRepo = new chevre.repository.Report(mongoose.connection);
        if (typeof (action === null || action === void 0 ? void 0 : action.id) === 'string' && typeof (action === null || action === void 0 ? void 0 : action.typeOf) === 'string') {
            // とりあえずアクション保管
            // await actionRepo.actionModel.findByIdAndUpdate(
            //     action.id,
            //     { $setOnInsert: action },
            //     { upsert: true }
            // )
            //     .exec();
            yield chevre.service.webhook.onPaymentStatusChanged(action)({
                accountingReport: accountingReportRepo,
                order: orderRepo,
                report: reportRepo
            });
        }
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
exports.default = webhooksRouter;
