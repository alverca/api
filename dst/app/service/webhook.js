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
exports.onActionStatusChanged = exports.onOrderStatusChanged = void 0;
const alverca = require("@alverca/domain");
const moment = require("moment-timezone");
function onOrderStatusChanged(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        // 注文を保管
        yield repos.order.orderModel.findOneAndUpdate({ orderNumber: params.orderNumber }, { $setOnInsert: params }, { upsert: true })
            .exec();
    });
}
exports.onOrderStatusChanged = onOrderStatusChanged;
/**
 * 予約使用アクション変更イベント処理
 */
function onActionStatusChanged(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        const action = params;
        if (action.typeOf === alverca.factory.chevre.actionType.UseAction) {
            const actionObject = action.object;
            if (Array.isArray(actionObject)) {
                const reservations = actionObject;
                const attended = action.actionStatus === alverca.factory.chevre.actionStatusType.CompletedActionStatus;
                const dateUsed = moment(action.startDate)
                    .toDate();
                yield Promise.all(reservations.map((reservation) => __awaiter(this, void 0, void 0, function* () {
                    if (reservation.typeOf === alverca.factory.chevre.reservationType.EventReservation
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
                // すでにdateUsedがあれば、比較して同一であればunset
                if (oldDateUsed !== undefined) {
                    if (moment(params.dateUsed)
                        .isSame(moment(oldDateUsed))) {
                        yield repos.report.aggregateSaleModel.updateMany({
                            'reservation.id': {
                                $exists: true,
                                $eq: reservation.id
                            }
                        }, {
                            $unset: {
                                'reservation.reservedTicket.dateUsed': 1
                            }
                        })
                            .exec();
                    }
                }
                else {
                    // 同一でなければ何もしない
                }
            }
        }
    });
}
