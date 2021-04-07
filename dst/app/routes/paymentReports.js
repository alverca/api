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
const alverca = require("@alverca/domain");
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
        .toInt()
], validator_1.default, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        // tslint:disable-next-line:no-magic-numbers
        const limit = (typeof ((_a = req.query) === null || _a === void 0 ? void 0 : _a.limit) === 'number') ? Math.min(req.query.limit, 100) : 100;
        const page = (typeof ((_b = req.query) === null || _b === void 0 ? void 0 : _b.page) === 'number') ? Math.max(req.query.page, 1) : 1;
        const orderRepo = new alverca.repository.Order(mongoose.connection);
        const unwindAcceptedOffers = req.query.$unwindAcceptedOffers === '1';
        const matchStages = [
            {
                $match: {
                    'project.id': {
                        $exists: true,
                        $eq: (_c = req.project) === null || _c === void 0 ? void 0 : _c.id
                    }
                    // orderNumber: 'TTT3-0207796-8589840'
                }
            }
        ];
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
                        customer: '$customer',
                        orderNumber: '$orderNumber',
                        orderDate: '$orderDate',
                        numItemsByDB: {
                            $cond: {
                                if: { $isArray: '$acceptedOffers' },
                                then: { $size: '$acceptedOffers' },
                                else: 0
                            }
                        }
                    }
                }
            }
        ]);
        const actions = yield aggregate.limit(limit)
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
exports.default = paymentReportsRouter;
