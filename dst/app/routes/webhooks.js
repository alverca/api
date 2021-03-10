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
const alverca = require("@alverca/domain");
const cinerinoapi = require("@cinerino/sdk");
const express = require("express");
const mongoose = require("mongoose");
const webhook_1 = require("../controllers/webhook");
const OrderReportService = require("../service/report/order");
const webhooksRouter = express.Router();
const http_status_1 = require("http-status");
/**
 * 注文返金イベント
 * 購入者による手数料あり返品の場合に発生
 */
webhooksRouter.post('/onReturnOrder', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = req.body.data;
        if (typeof (order === null || order === void 0 ? void 0 : order.orderNumber) === 'string') {
            const reportRepo = new alverca.repository.Report(mongoose.connection);
            yield OrderReportService.createRefundOrderReport({
                order: order
            })({ report: reportRepo });
        }
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post('/onOrderStatusChanged', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = req.body.data;
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        if (typeof (order === null || order === void 0 ? void 0 : order.orderNumber) === 'string') {
            // 注文から売上レポート作成
            yield OrderReportService.createOrderReport({
                order: order
            })({ report: reportRepo });
            switch (order.orderStatus) {
                case cinerinoapi.factory.orderStatus.OrderReturned:
                    break;
                default:
            }
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
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        if (typeof (action === null || action === void 0 ? void 0 : action.typeOf) === 'string') {
            yield webhook_1.onActionStatusChanged(action)({ report: reportRepo });
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
        const actionRepo = new alverca.repository.Action(mongoose.connection);
        // とりあえずアクション保管
        if (typeof (action === null || action === void 0 ? void 0 : action.id) === 'string' && typeof (action === null || action === void 0 ? void 0 : action.typeOf) === 'string') {
            yield actionRepo.actionModel.findByIdAndUpdate(action.id, { $setOnInsert: action }, { upsert: true })
                .exec();
        }
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
exports.default = webhooksRouter;
