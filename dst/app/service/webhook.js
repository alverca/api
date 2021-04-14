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
exports.onPaymentStatusChanged = exports.onActionStatusChanged = exports.onOrderStatusChanged = void 0;
const chevre = require("@chevre/domain");
const cinerinoapi = require("@cinerino/sdk");
const moment = require("moment-timezone");
const onPaid_1 = require("./webhook/onPaid");
const onRefunded_1 = require("./webhook/onRefunded");
function onOrderStatusChanged(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        const order4report = createOrder4report(params);
        // 注文を保管
        yield repos.order.orderModel.findOneAndUpdate({ orderNumber: params.orderNumber }, { $setOnInsert: order4report }, { upsert: true })
            .exec();
        const accountingReport = createAccountingReport(order4report);
        // 経理レポートを保管
        yield repos.accountingReport.accountingReportModel.findOneAndUpdate({ 'mainEntity.orderNumber': params.orderNumber }, { $setOnInsert: accountingReport }, { upsert: true })
            .exec();
    });
}
exports.onOrderStatusChanged = onOrderStatusChanged;
function createOrder4report(params) {
    const numItems = (Array.isArray(params.acceptedOffers)) ? params.acceptedOffers.length : 0;
    // 必要な属性についてDate型に変換(でないと検索クエリを効率的に使えない)
    const acceptedOffers = (Array.isArray(params.acceptedOffers))
        ? params.acceptedOffers.map((o) => {
            if (o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
                let itemOffered = o.itemOffered;
                const reservationFor = itemOffered.reservationFor;
                itemOffered = Object.assign(Object.assign({}, itemOffered), { reservationFor: Object.assign(Object.assign(Object.assign(Object.assign({}, reservationFor), (typeof reservationFor.doorTime !== undefined)
                        ? {
                            doorTime: moment(reservationFor.doorTime)
                                .toDate()
                        }
                        : undefined), (typeof reservationFor.endDate !== undefined)
                        ? {
                            endDate: moment(reservationFor.endDate)
                                .toDate()
                        }
                        : undefined), (typeof reservationFor.startDate !== undefined)
                        ? {
                            startDate: moment(reservationFor.startDate)
                                .toDate()
                        }
                        : undefined) });
                return Object.assign(Object.assign({}, o), { itemOffered });
            }
            else {
                return o;
            }
        })
        : [];
    return Object.assign(Object.assign(Object.assign({}, params), { orderDate: moment(params.orderDate)
            .toDate(), acceptedOffers,
        numItems }), (params.dateReturned !== null && params.dateReturned !== undefined)
        ? {
            dateReturned: moment(params.dateReturned)
                .toDate()
        }
        : undefined);
}
function createAccountingReport(params) {
    return {
        project: params.project,
        typeOf: 'Report',
        hasPart: [],
        mainEntity: params
    };
}
/**
 * 予約使用アクション変更イベント処理
 */
function onActionStatusChanged(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        const action = params;
        if (action.typeOf === chevre.factory.actionType.UseAction) {
            const actionObject = action.object;
            if (Array.isArray(actionObject)) {
                const reservations = actionObject;
                const attended = action.actionStatus === chevre.factory.actionStatusType.CompletedActionStatus;
                const dateUsed = moment(action.startDate)
                    .toDate();
                yield Promise.all(reservations.map((reservation) => __awaiter(this, void 0, void 0, function* () {
                    if (reservation.typeOf === chevre.factory.reservationType.EventReservation
                        && typeof reservation.id === 'string'
                        && reservation.id.length > 0) {
                        yield useReservationAction2report({
                            reservation,
                            attended,
                            dateUsed
                        })(repos);
                    }
                })));
            }
        }
    });
}
exports.onActionStatusChanged = onActionStatusChanged;
/**
 * 予約をレポートに反映する
 */
function useReservationAction2report(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const reservation = params.reservation;
        const reportDoc = yield repos.report.aggregateSaleModel.findOne({
            'reservation.id': {
                $exists: true,
                $eq: reservation.id
            }
        })
            .exec();
        if (reportDoc !== null) {
            const report = reportDoc.toObject();
            const oldDateUsed = (_a = report.reservation.reservedTicket) === null || _a === void 0 ? void 0 : _a.dateUsed;
            if (params.attended) {
                if (oldDateUsed !== undefined) {
                    // すでにdateUsedがあれば何もしない
                }
                else {
                    yield repos.report.aggregateSaleModel.updateMany({
                        'reservation.id': {
                            $exists: true,
                            $eq: reservation.id
                        }
                    }, {
                        'reservation.reservedTicket.dateUsed': params.dateUsed
                    })
                        .exec();
                }
            }
            else {
                // 入場取消は廃止済
                // すでにdateUsedがあれば、比較して同一であればunset
                // if (oldDateUsed !== undefined) {
                //     if (moment(params.dateUsed)
                //         .isSame(moment(oldDateUsed))) {
                //         await repos.report.aggregateSaleModel.updateMany(
                //             {
                //                 'reservation.id': {
                //                     $exists: true,
                //                     $eq: reservation.id
                //                 }
                //             },
                //             {
                //                 $unset: {
                //                     'reservation.reservedTicket.dateUsed': 1
                //                 }
                //             }
                //         )
                //             .exec();
                //     }
                // } else {
                //     // 同一でなければ何もしない
                // }
            }
        }
    });
}
/**
 * 決済ステータス変更イベント
 */
function onPaymentStatusChanged(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        switch (params.typeOf) {
            case chevre.factory.actionType.PayAction:
                yield onPaid_1.onPaid(params)(repos);
                break;
            case chevre.factory.actionType.RefundAction:
                yield onRefunded_1.onRefunded(params)(repos);
                break;
            default:
            // no op
        }
    });
}
exports.onPaymentStatusChanged = onPaymentStatusChanged;
