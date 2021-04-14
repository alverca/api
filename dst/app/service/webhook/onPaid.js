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
exports.onPaid = void 0;
/**
 * 決済イベント受信サービス
 */
const alverca = require("@chevre/domain");
const cinerinoapi = require("@cinerino/sdk");
const moment = require("moment-timezone");
const order_1 = require("../report/order");
function onPaid(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        switch (params.purpose.typeOf) {
            // 返品手数料決済であれば
            case alverca.factory.actionType.ReturnAction:
                yield onReturnFeePaid(params)(repos);
                break;
            // 注文決済であれば
            case cinerinoapi.factory.order.OrderType.Order:
                yield onOrderPaid(params)(repos);
                break;
            default:
        }
    });
}
exports.onPaid = onPaid;
function onReturnFeePaid(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const orderNumber = (_b = (_a = params.purpose) === null || _a === void 0 ? void 0 : _a.object) === null || _b === void 0 ? void 0 : _b.orderNumber;
        if (typeof orderNumber !== 'string') {
            throw new Error('params.purpose.object.orderNumber not string');
        }
        // 注文番号で注文決済行を取得
        const reservedReport = yield repos.report.aggregateSaleModel.findOne({
            category: alverca.factory.report.order.ReportCategory.Reserved,
            'mainEntity.orderNumber': {
                $exists: true,
                $eq: orderNumber
            }
        })
            .exec()
            .then((doc) => {
            if (doc === null) {
                throw new Error('Reserved report not found');
            }
            return doc.toObject();
        });
        // 返品手数料行を作成
        // category amount dateRecorded sortBy paymentSeatIndexを変更すればよい
        let amount = 0;
        if (typeof ((_c = params.object[0].paymentMethod.totalPaymentDue) === null || _c === void 0 ? void 0 : _c.value) === 'number') {
            amount = params.object[0].paymentMethod.totalPaymentDue.value;
        }
        const sortBy = reservedReport.sortBy.replace(':00:', ':02:');
        const dateRecorded = moment(params.startDate)
            .toDate();
        const report = Object.assign(Object.assign({}, reservedReport), { amount, category: alverca.factory.report.order.ReportCategory.CancellationFee, dateRecorded,
            sortBy });
        if (typeof report.payment_seat_index === 'number') {
            delete report.payment_seat_index;
        }
        delete report._id;
        delete report.id;
        yield repos.report.saveReport(report);
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
function onOrderPaid(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        // 注文を取得して、売上レポートに連携
        const orderNumber = (_a = params.purpose) === null || _a === void 0 ? void 0 : _a.orderNumber;
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
            order: Object.assign(Object.assign({}, order), { orderStatus: cinerinoapi.factory.orderStatus.OrderProcessing })
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
