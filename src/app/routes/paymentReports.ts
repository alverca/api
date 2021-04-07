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
    async (req, res, next) => {
        try {
            // tslint:disable-next-line:no-magic-numbers
            const limit = (typeof req.query?.limit === 'number') ? Math.min(req.query.limit, 100) : 100;
            const page = (typeof req.query?.page === 'number') ? Math.max(req.query.page, 1) : 1;

            const orderRepo = new alverca.repository.Order(mongoose.connection);

            const unwindAcceptedOffers = req.query.$unwindAcceptedOffers === '1';

            const matchStages = [
                {
                    $match: {
                        'project.id': {
                            $exists: true,
                            $eq: req.project?.id
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

            const actions = await aggregate.limit(limit)
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
