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
 * 決済レポートルーター
 */
const chevre = require("@chevre/domain");
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const mongoose = require("mongoose");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const paymentReportsRouter = express_1.Router();
/**
 * 検索
 */
paymentReportsRouter.get('', permitScopes_1.default(['admin']), ...[
    express_validator_1.query('limit')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('page')
        .optional()
        .isInt()
        .toInt(),
    express_validator_1.query('order.orderDate.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('order.orderDate.$lte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('order.acceptedOffers.itemOffered.reservationFor.startDate.$gte')
        .optional()
        .isISO8601()
        .toDate(),
    express_validator_1.query('order.acceptedOffers.itemOffered.reservationFor.startDate.$lte')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, 
// tslint:disable-next-line:max-func-body-length
(req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (typeof ((_a = req.query) === null || _a === void 0 ? void 0 : _a.limit) === 'number') ? Math.min(req.query.limit, 100) : 100;
        const page = (typeof ((_b = req.query) === null || _b === void 0 ? void 0 : _b.page) === 'number') ? Math.max(req.query.page, 1) : 1;
        const orderRepo = new chevre.repository.Order(mongoose.connection);
        const unwindAcceptedOffers = req.query.$unwindAcceptedOffers === '1';
        const matchStages = request2matchStages(req);
        const aggregate = orderRepo.orderModel.aggregate([
            { $unwind: '$actions' },
            ...(unwindAcceptedOffers) ? [{ $unwind: '$acceptedOffers' }] : [],
            ...matchStages,
            {
                $project: {
                    _id: 0,
                    typeOf: '$actions.typeOf',
                    endDate: '$actions.endDate',
                    startDate: '$actions.startDate',
                    object: { $arrayElemAt: ['$actions.object', 0] },
                    purpose: '$actions.purpose',
                    order: {
                        acceptedOffers: '$acceptedOffers',
                        confirmationNumber: '$confirmationNumber',
                        customer: '$customer',
                        numItems: '$numItems',
                        orderNumber: '$orderNumber',
                        orderDate: '$orderDate',
                        price: '$price',
                        project: '$project',
                        seller: '$seller'
                    }
                }
            }
        ]);
        const actions = yield aggregate.limit(limit * page)
            .skip(limit * (page - 1))
            // .setOptions({ maxTimeMS: 10000 }))
            .exec();
        // actions = actions.map((a) => {
        //     let clientId = '';
        //     if (Array.isArray(a.order.customer.identifier)) {
        //         const clientIdProperty = a.order.customer.identifier.find((p) => p.name === 'clientId');
        //         if (clientIdProperty !== undefined) {
        //             clientId = clientIdProperty.value;
        //         }
        //     }
        //     let itemType = '';
        //     if (Array.isArray(a.order.acceptedOffers) && a.order.acceptedOffers.length > 0) {
        //         itemType = a.order.acceptedOffers[0].itemOffered.typeOf;
        //     } else if (a.order.acceptedOffers !== undefined && typeof a.order.acceptedOffers.typeOf === 'string') {
        //         itemType = a.order.acceptedOffers.itemOffered.typeOf;
        //     }
        //     if (a.typeOf === 'PayAction' && a.purpose.typeOf === 'ReturnAction') {
        //         itemType = 'ReturnFee';
        //     }
        //     return {
        //         ...a,
        //         itemType,
        //         order: {
        //             ...a.order,
        //             customer: {
        //                 ...a.order.customer,
        //                 // ...(Array.isArray(a.order.customer.additionalProperty))
        //                 //     ? { additionalProperty: JSON.stringify(a.order.customer.additionalProperty) }
        //                 //     : undefined,
        //                 clientId
        //             },
        //             numItems: a.order.acceptedOffers.length
        //         }
        //     };
        // });
        res.json(actions);
    }
    catch (error) {
        next(error);
    }
}));
function request2matchStages(req) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const matchStages = [{
            $match: { 'project.id': { $eq: (_a = req.project) === null || _a === void 0 ? void 0 : _a.id } }
        }];
    const orderNumberEq = (_c = (_b = req.query.order) === null || _b === void 0 ? void 0 : _b.orderNumber) === null || _c === void 0 ? void 0 : _c.$eq;
    if (typeof orderNumberEq === 'string') {
        matchStages.push({
            $match: { orderNumber: { $eq: orderNumberEq } }
        });
    }
    const paymentMethodIdEq = (_f = (_e = (_d = req.query.order) === null || _d === void 0 ? void 0 : _d.paymentMethods) === null || _e === void 0 ? void 0 : _e.paymentMethodId) === null || _f === void 0 ? void 0 : _f.$eq;
    if (typeof paymentMethodIdEq === 'string') {
        matchStages.push({
            $match: { 'paymentMethods.paymentMethodId': { $exists: true, $eq: paymentMethodIdEq } }
        });
    }
    const orderDateGte = (_h = (_g = req.query.order) === null || _g === void 0 ? void 0 : _g.orderDate) === null || _h === void 0 ? void 0 : _h.$gte;
    if (orderDateGte instanceof Date) {
        matchStages.push({
            $match: { orderDate: { $gte: orderDateGte } }
        });
    }
    const orderDateLte = (_k = (_j = req.query.order) === null || _j === void 0 ? void 0 : _j.orderDate) === null || _k === void 0 ? void 0 : _k.$lte;
    if (orderDateLte instanceof Date) {
        matchStages.push({
            $match: { orderDate: { $lte: orderDateLte } }
        });
    }
    const reservationForStartDateGte = (_q = (_p = (_o = (_m = (_l = req.query.order) === null || _l === void 0 ? void 0 : _l.acceptedOffers) === null || _m === void 0 ? void 0 : _m.itemOffered) === null || _o === void 0 ? void 0 : _o.reservationFor) === null || _p === void 0 ? void 0 : _p.startDate) === null || _q === void 0 ? void 0 : _q.$gte;
    if (reservationForStartDateGte instanceof Date) {
        matchStages.push({
            $match: { 'acceptedOffers.itemOffered.reservationFor.startDate': { $exists: true, $gte: reservationForStartDateGte } }
        });
    }
    const reservationForStartDateLte = (_v = (_u = (_t = (_s = (_r = req.query.order) === null || _r === void 0 ? void 0 : _r.acceptedOffers) === null || _s === void 0 ? void 0 : _s.itemOffered) === null || _t === void 0 ? void 0 : _t.reservationFor) === null || _u === void 0 ? void 0 : _u.startDate) === null || _v === void 0 ? void 0 : _v.$lte;
    if (reservationForStartDateLte instanceof Date) {
        matchStages.push({
            $match: { 'acceptedOffers.itemOffered.reservationFor.startDate': { $exists: true, $lte: reservationForStartDateLte } }
        });
    }
    return matchStages;
}
exports.default = paymentReportsRouter;
