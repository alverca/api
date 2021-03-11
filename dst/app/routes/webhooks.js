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
const OrderReportService = require("../service/report/order");
const webhook_1 = require("../service/webhook");
const USE_PAY_ORDER_ACTION = process.env.USE_PAY_ORDER_ACTION === '1';
const webhooksRouter = express.Router();
const http_status_1 = require("http-status");
/**
 * 注文返金イベント
 * 購入者による手数料あり返品の場合に発生
 */
// webhooksRouter.post(
//     '/onReturnOrder',
//     async (__, res, next) => {
//         try {
//             const order = <cinerinoapi.factory.order.IOrder | undefined>req.body.data;
//             if (typeof order?.orderNumber === 'string') {
//                 const reportRepo = new alverca.repository.Report(mongoose.connection);
//                 await OrderReportService.createRefundOrderReport({
//                     order: order
//                 })({ report: reportRepo });
//             }
//             res.status(NO_CONTENT)
//                 .end();
//         } catch (error) {
//             next(error);
//         }
//     }
// );
/**
 * 注文ステータス変更イベント
 */
webhooksRouter.post('/onOrderStatusChanged', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = req.body.data;
        const orderRepo = new alverca.repository.Order(mongoose.connection);
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        if (typeof (order === null || order === void 0 ? void 0 : order.orderNumber) === 'string') {
            yield webhook_1.onOrderStatusChanged(order)({ order: orderRepo });
            switch (order.orderStatus) {
                case cinerinoapi.factory.orderStatus.OrderProcessing:
                case cinerinoapi.factory.orderStatus.OrderReturned:
                    if (!USE_PAY_ORDER_ACTION) {
                        // 注文から売上レポート作成
                        yield OrderReportService.createOrderReport({
                            order: order
                        })({ report: reportRepo });
                    }
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
        const orderRepo = new alverca.repository.Order(mongoose.connection);
        const reportRepo = new alverca.repository.Report(mongoose.connection);
        if (typeof (action === null || action === void 0 ? void 0 : action.id) === 'string' && typeof (action === null || action === void 0 ? void 0 : action.typeOf) === 'string') {
            // とりあえずアクション保管
            yield actionRepo.actionModel.findByIdAndUpdate(action.id, { $setOnInsert: action }, { upsert: true })
                .exec();
            yield webhook_1.onPaymentStatusChanged(action)({
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
