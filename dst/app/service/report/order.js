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
exports.createRefundOrderReport = exports.createOrderReport = exports.PriceSpecificationType = void 0;
/**
 * 売上レポートサービス
 */
const alverca = require("@alverca/domain");
const cinerinoapi = require("@cinerino/sdk");
const moment = require("moment-timezone");
const util = require("util");
exports.PriceSpecificationType = cinerinoapi.factory.chevre.priceSpecificationType;
/**
 * 注文アイテムから単価を取得する
 */
function getUnitPriceByAcceptedOffer(offer) {
    var _a, _b;
    let unitPrice = 0;
    const priceSpecType = (_a = offer.priceSpecification) === null || _a === void 0 ? void 0 : _a.typeOf;
    if (priceSpecType === exports.PriceSpecificationType.CompoundPriceSpecification) {
        const priceSpecification = offer.priceSpecification;
        const unitPriceSpec = (_b = priceSpecification.priceComponent) === null || _b === void 0 ? void 0 : _b.find((c) => c.typeOf === exports.PriceSpecificationType.UnitPriceSpecification);
        if (typeof (unitPriceSpec === null || unitPriceSpec === void 0 ? void 0 : unitPriceSpec.price) === 'number') {
            unitPrice = unitPriceSpec.price;
        }
    }
    return unitPrice;
}
function getSortBy(order, orderItem, status) {
    var _a;
    let sortBy = util.format('%s:%s:%s', `00000000000000000000${moment(order.orderDate)
        .unix()}`
        // tslint:disable-next-line:no-magic-numbers
        .slice(-20), `00000000000000000000${order.confirmationNumber}`
        // tslint:disable-next-line:no-magic-numbers
        .slice(-20), status);
    if (orderItem.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
        const seatNumber = (_a = orderItem.reservedTicket.ticketedSeat) === null || _a === void 0 ? void 0 : _a.seatNumber;
        sortBy = util.format('%s:%s:%s:%s', `00000000000000000000${moment(orderItem.reservationFor.startDate)
            .unix()}`
            // tslint:disable-next-line:no-magic-numbers
            .slice(-20), `00000000000000000000${order.confirmationNumber}`
            // tslint:disable-next-line:no-magic-numbers
            .slice(-20), status, (typeof seatNumber === 'string') ? seatNumber : orderItem.id);
    }
    return sortBy;
}
/**
 * 注文からレポートを作成する
 */
function createOrderReport(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        let datas = [];
        switch (params.order.orderStatus) {
            case cinerinoapi.factory.orderStatus.OrderProcessing:
                datas = params.order.acceptedOffers
                    .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation)
                    .map((o, index) => {
                    const unitPrice = getUnitPriceByAcceptedOffer(o);
                    return reservation2report({
                        category: alverca.factory.report.order.ReportCategory.Reserved,
                        r: o.itemOffered,
                        unitPrice: unitPrice,
                        order: params.order,
                        paymentSeatIndex: index,
                        salesDate: moment(params.order.orderDate)
                            .toDate()
                    });
                });
                break;
            case cinerinoapi.factory.orderStatus.OrderDelivered:
                break;
            case cinerinoapi.factory.orderStatus.OrderReturned:
                datas = params.order.acceptedOffers
                    .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation)
                    .map((o, index) => {
                    const unitPrice = getUnitPriceByAcceptedOffer(o);
                    return reservation2report({
                        category: alverca.factory.report.order.ReportCategory.Cancelled,
                        r: o.itemOffered,
                        unitPrice: unitPrice,
                        order: params.order,
                        paymentSeatIndex: index,
                        salesDate: moment(params.order.dateReturned)
                            .toDate()
                    });
                });
                break;
            default:
        }
        // 冪等性の確保!
        yield Promise.all(datas.map((data) => __awaiter(this, void 0, void 0, function* () {
            yield repos.report.saveReport(data);
        })));
    });
}
exports.createOrderReport = createOrderReport;
/**
 * 返金された注文からレポートを作成する
 */
function createRefundOrderReport(params) {
    return (repos) => __awaiter(this, void 0, void 0, function* () {
        const datas = [];
        const acceptedOffers = params.order.acceptedOffers
            .filter((o) => o.itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation);
        if (acceptedOffers.length > 0) {
            const acceptedOffer = acceptedOffers[0];
            const unitPrice = getUnitPriceByAcceptedOffer(acceptedOffer);
            datas.push(Object.assign({}, reservation2report({
                category: alverca.factory.report.order.ReportCategory.CancellationFee,
                r: acceptedOffer.itemOffered,
                unitPrice: unitPrice,
                order: params.order,
                // 返品手数料行にはpayment_seat_indexなし
                paymentSeatIndex: undefined,
                salesDate: moment(params.order.dateReturned)
                    .toDate()
            })));
        }
        // 冪等性の確保!
        yield Promise.all(datas.map((data) => __awaiter(this, void 0, void 0, function* () {
            yield repos.report.saveReport(data);
        })));
    });
}
exports.createRefundOrderReport = createRefundOrderReport;
/**
 * 予約データをcsvデータ型に変換する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function reservation2report(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const order = params.order;
    const age = (typeof order.customer.age === 'string') ? order.customer.age : '';
    let username = '';
    if (typeof ((_a = order.customer.memberOf) === null || _a === void 0 ? void 0 : _a.membershipNumber) === 'string') {
        username = order.customer.memberOf.membershipNumber;
    }
    // order.brokerを参照するように変更
    if (Array.isArray((_b = order.broker) === null || _b === void 0 ? void 0 : _b.identifier)) {
        const usernameByBroker = (_d = (_c = order.broker) === null || _c === void 0 ? void 0 : _c.identifier.find((p) => p.name === 'username')) === null || _d === void 0 ? void 0 : _d.value;
        if (typeof usernameByBroker === 'string') {
            username = usernameByBroker;
        }
    }
    let paymentMethodName = '';
    // 決済方法区分がOthersの場合のみ、名称を取り込む
    if (Array.isArray(order.paymentMethods) && order.paymentMethods.length > 0) {
        if (order.paymentMethods[0].typeOf === 'Others') {
            paymentMethodName = order.paymentMethods[0].name;
        }
        else {
            paymentMethodName = order.paymentMethods[0].typeOf;
        }
    }
    const locale = (typeof order.customer.address === 'string') ? order.customer.address : '';
    const gender = (typeof order.customer.gender === 'string') ? order.customer.gender : '';
    const customerSegment = (locale !== '' ? locale : '__') + (age !== '' ? age : '__') + (gender !== '' ? gender : '_');
    const customerGroup = order2customerGroup(order);
    let amount = Number(order.price);
    const customer = {
        group: customerGroup2reportString({ group: customerGroup }),
        givenName: (typeof order.customer.givenName === 'string') ? order.customer.givenName : '',
        familyName: (typeof order.customer.familyName === 'string') ? order.customer.familyName : '',
        email: (typeof order.customer.email === 'string') ? order.customer.email : '',
        telephone: (typeof order.customer.telephone === 'string') ? order.customer.telephone : '',
        segment: customerSegment,
        username: username
    };
    const paymentMethod = paymentMethodName2reportString({ name: paymentMethodName });
    const mainEntity = {
        confirmationNumber: order.confirmationNumber,
        customer: customer,
        orderDate: moment(order.orderDate)
            .toDate(),
        orderNumber: order.orderNumber,
        paymentMethod: paymentMethod,
        price: order.price,
        typeOf: order.typeOf
    };
    let csvCode = '';
    let seatNumber;
    let reservation = {
        id: '',
        reservationFor: {
            id: '',
            startDate: moment(order.orderDate)
                .toDate()
        }
    };
    if (params.r.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
        const reservationByOrder = params.r;
        // 注文アイテムが予約の場合
        const csvCodeByOrder = (_f = (_e = reservationByOrder.reservedTicket.ticketType.additionalProperty) === null || _e === void 0 ? void 0 : _e.find((p) => p.name === 'csvCode')) === null || _f === void 0 ? void 0 : _f.value;
        if (typeof csvCodeByOrder === 'string') {
            csvCode = csvCodeByOrder;
        }
        seatNumber = (_g = reservationByOrder.reservedTicket.ticketedSeat) === null || _g === void 0 ? void 0 : _g.seatNumber;
        reservation = {
            id: reservationByOrder.id,
            reservationFor: {
                id: reservationByOrder.reservationFor.id,
                startDate: moment(reservationByOrder.reservationFor.startDate)
                    .toDate()
            },
            reservedTicket: {
                ticketType: Object.assign({ csvCode, name: reservationByOrder.reservedTicket.ticketType.name }, (typeof params.unitPrice === 'number')
                    ? { priceSpecification: { price: params.unitPrice } }
                    : undefined),
                ticketedSeat: (typeof seatNumber === 'string') ? { seatNumber } : undefined
            }
        };
    }
    let sortBy;
    switch (params.category) {
        case alverca.factory.report.order.ReportCategory.CancellationFee:
            let cancellationFee = 0;
            const returnerIdentifier = (_h = params.order.returner) === null || _h === void 0 ? void 0 : _h.identifier;
            if (Array.isArray(returnerIdentifier)) {
                const cancellationFeeValue = (_j = returnerIdentifier.find((p) => p.name === 'cancellationFee')) === null || _j === void 0 ? void 0 : _j.value;
                if (cancellationFeeValue !== undefined) {
                    cancellationFee = Number(cancellationFeeValue);
                }
            }
            amount = cancellationFee;
            sortBy = getSortBy(params.order, params.r, '02');
            break;
        case alverca.factory.report.order.ReportCategory.Cancelled:
            sortBy = getSortBy(params.order, params.r, '01');
            break;
        case alverca.factory.report.order.ReportCategory.Reserved:
            sortBy = getSortBy(params.order, params.r, '00');
            break;
        default:
            throw new Error(`category ${params.category} not implemented`);
    }
    return Object.assign({ amount: amount, category: params.category, dateRecorded: params.salesDate, mainEntity: mainEntity, project: { typeOf: order.project.typeOf, id: order.project.id }, reservation: reservation, sortBy }, (typeof params.paymentSeatIndex === 'number') ? { payment_seat_index: params.paymentSeatIndex } : undefined);
}
function order2customerGroup(params) {
    var _a;
    let customerGroup = 'Customer';
    if (Array.isArray(params.customer.identifier)) {
        const customerGroupValue = (_a = params.customer.identifier.find((i) => i.name === 'customerGroup')) === null || _a === void 0 ? void 0 : _a.value;
        if (typeof customerGroupValue === 'string') {
            customerGroup = customerGroupValue;
        }
    }
    return customerGroup;
}
function paymentMethodName2reportString(params) {
    if (params.name === 'CreditCard') {
        return '0';
    }
    return params.name;
}
function customerGroup2reportString(params) {
    if (params.group === 'Customer') {
        return '01';
    }
    else if (params.group === 'Staff') {
        return '04';
    }
    return params.group;
}
