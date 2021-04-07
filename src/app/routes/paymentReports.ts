/**
 * 決済レポートルーター
 */
import * as alverca from '@alverca/domain';

import { Router } from 'express';
import { query } from 'express-validator';
import * as mongoose from 'mongoose';

import permitScopes from '../middlewares/permitScopes';
import validator from '../middlewares/validator';

const paymentReportsRouter = Router();

/**
 * 検索
 */
paymentReportsRouter.get(
    '',
    permitScopes(['admin']),
    ...[
        query('limit')
            .optional()
            .isInt()
            .toInt(),
        query('page')
            .optional()
            .isInt()
            .toInt()
    ],
    validator,
    // tslint:disable-next-line:max-func-body-length
    async (req, res, next) => {
        try {
            // tslint:disable-next-line:no-magic-numbers
            const limit = (typeof req.query?.limit === 'number') ? Math.min(req.query.limit, 100) : 100;
            const page = (typeof req.query?.page === 'number') ? Math.max(req.query.page, 1) : 1;

            const orderRepo = new alverca.repository.Order(mongoose.connection);

            const unwindAcceptedOffers = req.query.$unwindAcceptedOffers === '1';

            const matchStages: any[] = [{
                $match: { 'project.id': { $eq: req.project?.id } }
            }];

            const orderNumberEq = req.query.order?.orderNumber?.$eq;
            if (typeof orderNumberEq === 'string') {
                matchStages.push({
                    $match: { orderNumber: { $eq: orderNumberEq } }
                });
            }

            const paymentMethodIdEq = req.query.order?.paymentMethods?.paymentMethodId?.$eq;
            if (typeof paymentMethodIdEq === 'string') {
                matchStages.push({
                    $match: { 'paymentMethods.paymentMethodId': { $exists: true, $eq: paymentMethodIdEq } }
                });
            }

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

            const actions = await aggregate.limit(limit * page)
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
        } catch (error) {
            next(error);
        }
    }
);

export default paymentReportsRouter;
