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
exports.onRefunded = void 0;
/**
 * 返金イベント受信サービス
 */
const chevre = require("@chevre/domain");
const cinerinoapi = require("@cinerino/sdk");
const moment = require("moment-timezone");
const order_1 = require("../report/order");
function onRefunded(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case chevre.factory.actionType.ReturnAction:
                yield onOrderRefunded(params)(repos);
                break;
            default:
        }
    });
}
exports.onRefunded = onRefunded;
function onOrderRefunded(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        // 注文を取得して、売上レポートに連携
        const orderNumber = (_b = (_a = params.purpose) === null || _a === void 0 ? void 0 : _a.object) === null || _b === void 0 ? void 0 : _b.orderNumber;
        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.orderNumber not string');
        }
        const order = yield repos.order.orderModel.findOne({ orderNumber })
            .exec()
            .then((doc) => {
            if (doc === null) {
                throw new Error('Order not found');
            }
            return doc.toObject();
        });
        // 注文から売上レポート作成
        yield order_1.createOrderReport({
            order: Object.assign(Object.assign({}, order), { orderStatus: cinerinoapi.factory.orderStatus.OrderReturned, dateReturned: moment(params.startDate)
                    .toDate() })
        })(repos);
        // 注文に決済アクションを追加
        const action4save = Object.assign(Object.assign(Object.assign({}, params), { startDate: moment(params.startDate)
                .toDate() }), (params.endDate !== undefined)
            ? {
                endDate: moment(params.startDate)
                    .toDate()
            }
            : undefined);
        const childReport = { typeOf: 'Report', mainEntity: action4save };
        yield repos.accountingReport.accountingReportModel.findOneAndUpdate({ 'mainEntity.orderNumber': orderNumber }, { $addToSet: { hasPart: childReport } })
            .exec();
    });
}
